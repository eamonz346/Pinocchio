import * as __ext_0 from "node:crypto";
import * as __ext_1 from "@pinocchio/shared";
import * as __ext_2 from "zod";
import * as __ext_3 from "node:dns/promises";
import * as __ext_4 from "node:net";
import * as __ext_5 from "node:fs";
import * as __ext_6 from "node:sqlite";
import * as __ext_7 from "node:os";
import * as __ext_8 from "node:path";
import * as __ext_9 from "node:fs/promises";
import * as __ext_10 from "node:worker_threads";
import * as __ext_11 from "@huggingface/tokenizers";
import * as __ext_12 from "node:url";
import __default_0 from "node:path";
import __default_1 from "sanitize-html";
import __default_2 from "node:vm";

export {};

namespace __core_utils_id {
import randomUUID = __ext_0.randomUUID;
export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function truncate(value: string, max = 240): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
}

namespace __core_utils_title {
import truncate = __core_utils_id.truncate;
const promptPrefix = /^(请|帮我|帮忙|麻烦|生成|写一份|做一个|创建|整理|分析|研究|执行)\s*/i;

export function compactTaskTitle(input: string, fallback: string, suffix?: string): string {
  const cleaned = input
    .replace(/[#*_`>[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(promptPrefix, "")
    .trim();
  const base = truncate(cleaned || fallback, 24).replace(/\.\.\.$/, "").trim();
  if (!suffix || hasSuffixIntent(base, suffix)) return base || fallback;
  return `${base}${suffix}`;
}

function hasSuffixIntent(value: string, suffix: string) {
  if (value.endsWith(suffix)) return true;
  if (suffix === "研究") return /research|研究/i.test(value);
  return false;
}
}

namespace __core_storage_storageAdapter {
import Result = __ext_1.Result;
import StorageError = __ext_1.StorageError;
export interface StorageAdapter {
  readJson<T>(key: string, fallback: T): Promise<Result<T, StorageError>>;
  writeJsonAtomic<T>(key: string, value: T): Promise<Result<void, StorageError>>;
  delete(key: string): Promise<Result<void, StorageError>>;
  list(prefix: string): Promise<Result<string[], StorageError>>;
}
}

namespace __core_pricing_deepSeekPricing {
import DeepSeekModelPricing = __ext_1.DeepSeekModelPricing;
import DeepSeekPricingStatus = __ext_1.DeepSeekPricingStatus;
import ModelName = __ext_1.ModelName;
import PricingCurrency = __ext_1.PricingCurrency;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
const sourceUrls: Record<PricingCurrency, string> = {
  CNY: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
  USD: "https://api-docs.deepseek.com/quick_start/pricing"
};
const maxCacheAgeMs = 7 * 24 * 60 * 60 * 1000;
const refreshIntervalMs = 24 * 60 * 60 * 1000;
const currencies: PricingCurrency[] = ["CNY", "USD"];

export const conservativePricing: Record<PricingCurrency, DeepSeekModelPricing[]> = {
  CNY: [
    { model: "deepseek-v4-flash", currency: "CNY", inputCacheHitPerMillion: 0.02, inputCacheMissPerMillion: 1, outputPerMillion: 2 },
    { model: "deepseek-v4-pro", currency: "CNY", inputCacheHitPerMillion: 0.1, inputCacheMissPerMillion: 12, outputPerMillion: 24 }
  ],
  USD: [
    { model: "deepseek-v4-flash", currency: "USD", inputCacheHitPerMillion: 0.0056, inputCacheMissPerMillion: 0.28, outputPerMillion: 0.56 },
    { model: "deepseek-v4-pro", currency: "USD", inputCacheHitPerMillion: 0.0145, inputCacheMissPerMillion: 1.74, outputPerMillion: 3.48 }
  ]
};

interface StoredPricing {
  currency: PricingCurrency;
  fetchedAt: string;
  discountExpiresAt?: string | null | undefined;
  models: DeepSeekModelPricing[];
}

type FetchLike = typeof fetch;

export class DeepSeekPricingService {
  private readonly statuses: Partial<Record<PricingCurrency, DeepSeekPricingStatus>> = {};
  private readonly refreshPromises: Partial<Record<PricingCurrency, Promise<DeepSeekPricingStatus>>> = {};
  private readonly lastRefreshAttempt: Partial<Record<PricingCurrency, number>> = {};

  constructor(
    private readonly storage: StorageAdapter,
    private readonly options: { fetchFn?: FetchLike | undefined } = {}
  ) {}

  async getStatus(currency: PricingCurrency = "USD"): Promise<DeepSeekPricingStatus> {
    this.statuses[currency] ??= await this.loadCachedStatus(currency);
    this.refreshInBackgroundIfDue(currency);
    return this.statuses[currency]!;
  }

  async getPricing(model: ModelName, currency: PricingCurrency = "USD"): Promise<{ pricing: DeepSeekModelPricing; status: DeepSeekPricingStatus }> {
    const status = await this.getStatus(currency);
    const pricing = status.models.find((item) => item.model === model) ?? conservativePricing[currency].find((item) => item.model === model);
    if (!pricing) throw new Error(`No DeepSeek pricing configured for ${model} ${currency}`);
    return { pricing, status };
  }

  refreshInBackgroundIfDue(currency?: PricingCurrency): void {
    for (const item of currency ? [currency] : currencies) {
      if (Date.now() - (this.lastRefreshAttempt[item] ?? 0) < refreshIntervalMs) continue;
      this.lastRefreshAttempt[item] = Date.now();
      void this.refreshFromOfficial(item).catch(() => undefined);
    }
  }

  async refreshFromOfficial(currency: PricingCurrency = "USD"): Promise<DeepSeekPricingStatus> {
    if (this.refreshPromises[currency]) return this.refreshPromises[currency]!;
    this.refreshPromises[currency] = this.fetchAndStore(currency).finally(() => {
      delete this.refreshPromises[currency];
    });
    return this.refreshPromises[currency]!;
  }

  private async fetchAndStore(currency: PricingCurrency): Promise<DeepSeekPricingStatus> {
    try {
      const fetchFn = this.options.fetchFn ?? fetch;
      const response = await fetchFn(sourceUrls[currency], { headers: { "user-agent": "Pinocchio/0.1" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const models = parseDeepSeekPricingPage(html, currency);
      const discountExpiresAt = parseDeepSeekDiscountExpiresAt(html);
      const fetchedAt = new Date().toISOString();
      await this.storage.writeJsonAtomic<StoredPricing>(cacheKey(currency), { currency, fetchedAt, discountExpiresAt, models });
      if (isExpiredDiscount(currency, models, discountExpiresAt)) {
        this.statuses[currency] = makeStatus(currency, "fallback", true, fetchedAt, conservativePricing[currency], `Official DeepSeek discount prices expired at ${discountExpiresAt}.`);
        return this.statuses[currency]!;
      }
      this.statuses[currency] = makeStatus(currency, "official", false, fetchedAt, models);
      return this.statuses[currency]!;
    } catch (error) {
      const cached = await this.readCache(currency);
      if (cached && this.isUsableCache(currency, cached)) {
        this.statuses[currency] = makeStatus(currency, "cache", false, cached.fetchedAt, cached.models, errorMessage(error));
      } else {
        this.statuses[currency] = makeStatus(currency, "fallback", Boolean(cached), cached?.fetchedAt ?? null, conservativePricing[currency], errorMessage(error));
      }
      return this.statuses[currency]!;
    }
  }

  private async loadCachedStatus(currency: PricingCurrency): Promise<DeepSeekPricingStatus> {
    const cached = await this.readCache(currency);
    if (!cached) return makeStatus(currency, "fallback", false, null, conservativePricing[currency]);
    const stale = !this.isUsableCache(currency, cached);
    return stale
      ? makeStatus(currency, "fallback", true, cached.fetchedAt, conservativePricing[currency])
      : makeStatus(currency, "cache", false, cached.fetchedAt, cached.models);
  }

  private async readCache(currency: PricingCurrency): Promise<StoredPricing | undefined> {
    const result = await this.storage.readJson<StoredPricing | null>(cacheKey(currency), null);
    if (!result.ok || !result.value) return undefined;
    return result.value;
  }

  private isUsableCache(currency: PricingCurrency, cached: StoredPricing): boolean {
    if (Date.now() - Date.parse(cached.fetchedAt) > maxCacheAgeMs) return false;
    const discounted = hasDiscountedPrices(currency, cached.models);
    if (!discounted) return true;
    if (!cached.discountExpiresAt) return false;
    return Date.now() <= Date.parse(cached.discountExpiresAt);
  }
}

export function parseDeepSeekPricingPage(html: string, currency: PricingCurrency = "USD"): DeepSeekModelPricing[] {
  const text = stripToText(html);
  const simpleRows = parseSimpleModelRows(text, currency);
  if (simpleRows) return simpleRows;
  return parsePricingMatrix(text, currency);
}

export function parseDeepSeekDiscountExpiresAt(html: string): string | null {
  const text = stripToText(html);
  const matches = [...text.matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})\s*UTC/gi)];
  for (const match of matches) {
    if (/(off|discount|\u6298\u6263|\u4f18\u60e0)/i.test(sentenceAround(text, match.index ?? 0))) return dateMatchToIso(match);
  }
  for (const match of matches) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 160), match.index ?? 0);
    if (/(off|discount|extended|until|expires?|ends?|\u6298\u6263|\u4f18\u60e0|\u5ef6\u957f|\u622a\u6b62|\u5230\u671f|\u6709\u6548)/i.test(before)) {
      return dateMatchToIso(match);
    }
  }
  const beijingMatches = [...text.matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})/g)];
  for (const match of beijingMatches) {
    const around = sentenceAround(text, match.index ?? 0);
    if (/\u5317\u4eac\u65f6\u95f4/i.test(around) && /(\u6298|\u4f18\u60e0|\u5ef6\u957f|\u622a\u6b62|\u5230\u671f|\u6709\u6548)/i.test(around)) {
      return dateMatchToIso(match, 8);
    }
  }
  return null;
}

function parseSimpleModelRows(text: string, currency: PricingCurrency): DeepSeekModelPricing[] | undefined {
  const models: ModelName[] = ["deepseek-v4-flash", "deepseek-v4-pro"];
  try {
    return models.map((model) => parseModelPricing(text, model, currency));
  } catch {
    return undefined;
  }
}

function parsePricingMatrix(text: string, currency: PricingCurrency): DeepSeekModelPricing[] {
  const labels = pricingLabels();
  const hit = pricesForRow(text, labels.hit, [...labels.miss, ...labels.output], currency);
  const miss = pricesForRow(text, labels.miss, [...labels.output, ...labels.afterRows], currency);
  const output = pricesForRow(text, labels.output, labels.afterRows, currency);
  return [
    { model: "deepseek-v4-flash", currency, inputCacheHitPerMillion: hit[0], inputCacheMissPerMillion: miss[0], outputPerMillion: output[0] },
    { model: "deepseek-v4-pro", currency, inputCacheHitPerMillion: hit[1], inputCacheMissPerMillion: miss[1], outputPerMillion: output[1] }
  ];
}

function pricesForRow(text: string, labels: string[], nextLabels: string[], currency: PricingCurrency): [number, number] {
  const found = findLabel(text, labels);
  if (!found) throw new Error(`DeepSeek pricing row missing: ${labels[0]}`);
  const valueStart = found.index + found.label.length;
  const end = nextLabels
    .map((next) => text.indexOf(next, valueStart))
    .filter((index) => index > valueStart)
    .sort((a, b) => a - b)[0] ?? Math.min(text.length, valueStart + 800);
  const prices = extractPrices(text.slice(valueStart, end), currency);
  if (prices.length < 2) throw new Error(`Unable to parse DeepSeek pricing row: ${found.label}`);
  return [prices[0]!, prices[1]!];
}

function parseModelPricing(text: string, model: ModelName, currency: PricingCurrency): DeepSeekModelPricing {
  const start = text.indexOf(model);
  if (start === -1) throw new Error(`DeepSeek pricing row missing: ${model}`);
  const nextModelIndex = ["deepseek-v4-flash", "deepseek-v4-pro"]
    .filter((item) => item !== model)
    .map((item) => text.indexOf(item, start + model.length))
    .filter((index) => index > start)
    .sort((a, b) => a - b)[0];
  const segment = text.slice(start, nextModelIndex ?? Math.min(text.length, start + 1200));
  const prices = extractPrices(segment, currency);
  if (prices.length < 3 || prices.slice(0, 3).some((value) => Number.isNaN(value))) {
    throw new Error(`Unable to parse DeepSeek pricing row: ${model}`);
  }
  return {
    model,
    currency,
    inputCacheHitPerMillion: prices[0]!,
    inputCacheMissPerMillion: prices[1]!,
    outputPerMillion: prices[2]!
  };
}

function extractPrices(segment: string, currency: PricingCurrency): number[] {
  const pattern = currency === "USD"
    ? /\$\s*([0-9]+(?:\.[0-9]+)?)/g
    : /(?:[\u00a5\uffe5]\s*([0-9]+(?:\.[0-9]+)?)|([0-9]+(?:\.[0-9]+)?)\s*(?:\u5143|CNY|RMB))/gi;
  return [...segment.matchAll(pattern)]
    .map((match) => Number(match[1] ?? match[2]))
    .filter((value) => Number.isFinite(value));
}

function pricingLabels() {
  return {
    hit: ["1M INPUT TOKENS (CACHE HIT)", "1M \u8f93\u5165 tokens\uff08\u7f13\u5b58\u547d\u4e2d\uff09", "1M \u8f93\u5165 tokens (\u7f13\u5b58\u547d\u4e2d)", "\u767e\u4e07tokens\u8f93\u5165\uff08\u7f13\u5b58\u547d\u4e2d\uff09"],
    miss: ["1M INPUT TOKENS (CACHE MISS)", "1M \u8f93\u5165 tokens\uff08\u7f13\u5b58\u672a\u547d\u4e2d\uff09", "1M \u8f93\u5165 tokens (\u7f13\u5b58\u672a\u547d\u4e2d)", "\u767e\u4e07tokens\u8f93\u5165\uff08\u7f13\u5b58\u672a\u547d\u4e2d\uff09"],
    output: ["1M OUTPUT TOKENS", "1M \u8f93\u51fa tokens", "\u767e\u4e07tokens\u8f93\u51fa"],
    afterRows: ["(1)", "Deduction Rules", "\u6263\u8d39\u89c4\u5219", "\u6298\u6263"]
  };
}

function findLabel(text: string, labels: string[]): { label: string; index: number } | undefined {
  return labels
    .map((label) => ({ label, index: text.indexOf(label) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)[0];
}

function sentenceAround(text: string, index: number): string {
  const marks = [".", "\u3002", "!", "?", "\uff1b", "\uff1a"];
  const starts = marks.map((mark) => text.lastIndexOf(mark, index)).filter((position) => position >= 0);
  const start = starts.length ? Math.max(...starts) + 1 : 0;
  const ends = marks.map((mark) => text.indexOf(mark, index)).filter((position) => position >= 0);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end);
}

function dateMatchToIso(match: RegExpMatchArray, utcOffsetHours = 0): string {
  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - utcOffsetHours, Number(minute))).toISOString();
}

function makeStatus(
  currency: PricingCurrency,
  source: DeepSeekPricingStatus["source"],
  stale: boolean,
  fetchedAt: string | null,
  models: DeepSeekModelPricing[],
  error?: string
): DeepSeekPricingStatus {
  return {
    currency,
    sourceUrl: sourceUrls[currency],
    source,
    stale,
    fetchedAt,
    updatedAt: new Date().toISOString(),
    models,
    ...(error ? { error } : {})
  };
}

function stripToText(html: string): string {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function hasDiscountedPrices(currency: PricingCurrency, models: DeepSeekModelPricing[]): boolean {
  return models.some((model) => {
    const conservative = conservativePricing[currency].find((item) => item.model === model.model);
    return Boolean(conservative && (
      model.inputCacheHitPerMillion < conservative.inputCacheHitPerMillion ||
      model.inputCacheMissPerMillion < conservative.inputCacheMissPerMillion ||
      model.outputPerMillion < conservative.outputPerMillion
    ));
  });
}

function isExpiredDiscount(currency: PricingCurrency, models: DeepSeekModelPricing[], discountExpiresAt: string | null | undefined): boolean {
  return Boolean(discountExpiresAt && hasDiscountedPrices(currency, models) && Date.now() > Date.parse(discountExpiresAt));
}

function cacheKey(currency: PricingCurrency): string {
  return `pricing/deepseek-v4-${currency.toLowerCase()}.json`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
}

namespace __core_usage_modelUsage {
import DeepSeekModelPricing = __ext_1.DeepSeekModelPricing;
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import ModelName = __ext_1.ModelName;
import ModelUsageSummary = __ext_1.ModelUsageSummary;
import PricingCurrency = __ext_1.PricingCurrency;
import DeepSeekRawUsageSchema = __ext_1.DeepSeekRawUsageSchema;
export function normalizeDeepSeekUsage(value: unknown): DeepSeekRawUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const details = typeof record.completion_tokens_details === "object" && record.completion_tokens_details
    ? record.completion_tokens_details as Record<string, unknown>
    : {};
  const promptTokens = numberValue(record.prompt_tokens);
  const completionTokens = numberValue(record.completion_tokens);
  const hitTokens = numberValue(record.prompt_cache_hit_tokens);
  const missTokens = numberValue(record.prompt_cache_miss_tokens);
  const totalTokens = numberValue(record.total_tokens) || promptTokens + completionTokens;
  return DeepSeekRawUsageSchema.parse({
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    prompt_cache_hit_tokens: hitTokens,
    prompt_cache_miss_tokens: missTokens,
    completion_tokens_details: {
      reasoning_tokens: numberValue(details.reasoning_tokens)
    }
  });
}

export function emptyUsageSummary(model: ModelName, currency: PricingCurrency = "USD"): ModelUsageSummary {
  return {
    model,
    currency,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    cacheHitRatio: 0,
    cost: 0,
    cacheSavings: 0,
    pricingSource: "fallback"
  };
}

export function summarizeUsage(
  model: ModelName,
  usage: DeepSeekRawUsage,
  pricing: DeepSeekModelPricing,
  pricingSource: ModelUsageSummary["pricingSource"]
): ModelUsageSummary {
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const hit = usage.prompt_cache_hit_tokens;
  const explicitMiss = usage.prompt_cache_miss_tokens;
  const miss = explicitMiss || Math.max(0, promptTokens - hit);
  const billedInputCost = perMillion(hit, pricing.inputCacheHitPerMillion) + perMillion(miss, pricing.inputCacheMissPerMillion);
  const outputCost = perMillion(completionTokens, pricing.outputPerMillion);
  const noCacheInputCost = perMillion(hit + miss, pricing.inputCacheMissPerMillion);
  const totalTokens = usage.total_tokens || promptTokens + completionTokens;
  return {
    model,
    currency: pricing.currency,
    promptTokens,
    completionTokens,
    reasoningTokens: usage.completion_tokens_details.reasoning_tokens,
    totalTokens,
    promptCacheHitTokens: hit,
    promptCacheMissTokens: miss,
    cacheHitRatio: hit + miss > 0 ? hit / (hit + miss) : 0,
    cost: roundMoney(billedInputCost + outputCost),
    cacheSavings: roundMoney(Math.max(0, noCacheInputCost - billedInputCost)),
    pricingSource
  };
}

export function mergeUsageSummaries(model: ModelName, items: ModelUsageSummary[], currency: PricingCurrency = items[0]?.currency ?? "USD"): ModelUsageSummary {
  const merged = items
    .filter((item) => item.currency === currency)
    .reduce(
      (acc, item) => ({
        promptTokens: acc.promptTokens + item.promptTokens,
        completionTokens: acc.completionTokens + item.completionTokens,
        reasoningTokens: acc.reasoningTokens + item.reasoningTokens,
        totalTokens: acc.totalTokens + item.totalTokens,
        promptCacheHitTokens: acc.promptCacheHitTokens + item.promptCacheHitTokens,
        promptCacheMissTokens: acc.promptCacheMissTokens + item.promptCacheMissTokens,
        cost: acc.cost + item.cost,
        cacheSavings: acc.cacheSavings + item.cacheSavings
      }),
      { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0, promptCacheHitTokens: 0, promptCacheMissTokens: 0, cost: 0, cacheSavings: 0 }
    );
  const filtered = items.filter((item) => item.currency === currency);
  const input = merged.promptCacheHitTokens + merged.promptCacheMissTokens;
  return {
    model,
    currency,
    ...merged,
    cacheHitRatio: input > 0 ? merged.promptCacheHitTokens / input : 0,
    cost: roundMoney(merged.cost),
    cacheSavings: roundMoney(merged.cacheSavings),
    pricingSource: filtered.some((item) => item.pricingSource === "official") ? "official" : filtered.some((item) => item.pricingSource === "cache") ? "cache" : "fallback"
  };
}

function perMillion(tokens: number, price: number): number {
  return (tokens / 1_000_000) * price;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(8));
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
}

namespace __core_usage_usageStore {
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import ModelUsageSummary = __ext_1.ModelUsageSummary;
import PricingCurrency = __ext_1.PricingCurrency;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import emptyUsageSummary = __core_usage_modelUsage.emptyUsageSummary;
import mergeUsageSummaries = __core_usage_modelUsage.mergeUsageSummaries;
const usageKey = "usage/model-usage-log.json";
const sessionTotalsKey = "usage/session-totals.json";
const maxEntries = 2000;

export interface UsageLogEntry {
  id: string;
  requestId: string;
  sessionId: string;
  createdAt: string;
  usage: ModelUsageSummary;
  usageByCurrency?: Partial<Record<PricingCurrency, ModelUsageSummary>> | undefined;
  rawUsages?: DeepSeekRawUsage[] | undefined;
}

interface SessionUsageTotal {
  sessionId: string;
  currency: PricingCurrency;
  updatedAt: string;
  usage: ModelUsageSummary;
}

export class UsageStore {
  constructor(private readonly storage: StorageAdapter) {}

  async append(entry: UsageLogEntry): Promise<void> {
    const current = await this.list();
    await this.storage.writeJsonAtomic(usageKey, [...current, entry].slice(-maxEntries));
    const summaries = entry.usageByCurrency ?? { [entry.usage.currency]: entry.usage };
    const totals = await this.readSessionTotals();
    let next = totals;
    for (const [currency, summary] of Object.entries(summaries) as [PricingCurrency, ModelUsageSummary | undefined][]) {
      if (!summary) continue;
      const existing = next.find((item) => item.sessionId === entry.sessionId && item.currency === currency);
      const usage = mergeUsageSummaries(summary.model, [existing?.usage ?? emptyUsageSummary(summary.model, currency), summary], currency);
      next = [
        ...next.filter((item) => !(item.sessionId === entry.sessionId && item.currency === currency)),
        { sessionId: entry.sessionId, currency, updatedAt: entry.createdAt, usage }
      ];
    }
    await this.storage.writeJsonAtomic(sessionTotalsKey, next);
  }

  async listSession(sessionId: string, currency?: PricingCurrency): Promise<UsageLogEntry[]> {
    return (await this.list()).filter((entry) => entry.sessionId === sessionId && (!currency || entry.usage.currency === currency || entry.usageByCurrency?.[currency]));
  }

  async sessionCost(sessionId: string, currency: PricingCurrency): Promise<number> {
    const total = (await this.readSessionTotals()).find((entry) => entry.sessionId === sessionId && entry.currency === currency);
    if (total) return total.usage.cost;
    return (await this.listSession(sessionId, currency)).reduce((totalCost, entry) => totalCost + (entry.usageByCurrency?.[currency]?.cost ?? (entry.usage.currency === currency ? entry.usage.cost : 0)), 0);
  }

  async sessionSummary(sessionId: string, model: ModelUsageSummary["model"], currency: PricingCurrency): Promise<ModelUsageSummary> {
    const total = (await this.readSessionTotals()).find((entry) => entry.sessionId === sessionId && entry.currency === currency);
    if (total) return { ...total.usage, model, currency };
    const summaries = (await this.listSession(sessionId, currency)).flatMap((entry) => entry.usageByCurrency?.[currency] ?? (entry.usage.currency === currency ? entry.usage : []));
    return summaries.length ? mergeUsageSummaries(model, summaries, currency) : emptyUsageSummary(model, currency);
  }

  private async list(): Promise<UsageLogEntry[]> {
    const stored = await this.storage.readJson<UsageLogEntry[]>(usageKey, []);
    return stored.ok ? stored.value : [];
  }

  private async readSessionTotals(): Promise<SessionUsageTotal[]> {
    const stored = await this.storage.readJson<SessionUsageTotal[]>(sessionTotalsKey, []);
    return stored.ok ? stored.value.filter((item) => item.currency === "CNY" || item.currency === "USD") : [];
  }
}
}

namespace __core_usage_budget {
import BudgetStatus = __ext_1.BudgetStatus;
import PricingCurrency = __ext_1.PricingCurrency;
import UsageStore = __core_usage_usageStore.UsageStore;
export class BudgetLimitError extends Error {
  constructor(readonly status: BudgetStatus) {
    super(status.message ?? "Session budget exhausted.");
  }
}

export class BudgetService {
  constructor(
    private readonly store: UsageStore,
    private readonly limits: Record<PricingCurrency, number>
  ) {}

  async ensureCanCall(sessionId: string, currency: PricingCurrency, estimatedCost = 0): Promise<void> {
    const status = await this.status(sessionId, currency, estimatedCost);
    if (status.state === "blocked") throw new BudgetLimitError(status);
  }

  async status(sessionId: string, currency: PricingCurrency, extraCost = 0): Promise<BudgetStatus> {
    const limit = this.limits[currency];
    const sessionCost = roundMoney(await this.store.sessionCost(sessionId, currency) + extraCost);
    const ratio = sessionCost / limit;
    const state = ratio >= 1 ? "blocked" : ratio >= 0.8 ? "warning" : "ok";
    return {
      currency,
      limit,
      sessionCost,
      ratio,
      state,
      ...(state === "warning" ? { message: "Session budget is above 80%." } : {}),
      ...(state === "blocked" ? { message: "Session budget reached 100%. The next real model call is blocked." } : {})
    };
  }
}

function roundMoney(value: number): number {
  return Number(value.toFixed(8));
}
}

namespace __core_usage_usageTracker {
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import ModelName = __ext_1.ModelName;
import ModelUsageSummary = __ext_1.ModelUsageSummary;
import PricingCurrency = __ext_1.PricingCurrency;
import UsageSummary = __ext_1.UsageSummary;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import DeepSeekPricingService = __core_pricing_deepSeekPricing.DeepSeekPricingService;
import mergeUsageSummaries = __core_usage_modelUsage.mergeUsageSummaries;
import summarizeUsage = __core_usage_modelUsage.summarizeUsage;
import BudgetService = __core_usage_budget.BudgetService;
import UsageStore = __core_usage_usageStore.UsageStore;
const currencies: PricingCurrency[] = ["CNY", "USD"];

export class UsageTracker {
  constructor(
    private readonly pricing: DeepSeekPricingService,
    private readonly store: UsageStore,
    private readonly budget: BudgetService
  ) {}

  async record(input: { requestId: string; sessionId: string; model: ModelName; currency: PricingCurrency; usages: DeepSeekRawUsage[] }): Promise<UsageSummary | undefined> {
    if (!input.usages.length) return undefined;
    const usageByCurrency = await this.summarizeTurnForAllCurrencies(input.model, input.usages);
    const turn = usageByCurrency[input.currency]!;
    await this.store.append({
      id: createId("usage"),
      requestId: input.requestId,
      sessionId: input.sessionId,
      createdAt: nowIso(),
      usage: turn,
      usageByCurrency,
      rawUsages: input.usages
    });
    const session = await this.store.sessionSummary(input.sessionId, input.model, input.currency);
    const budget = await this.budget.status(input.sessionId, input.currency);
    return { turn, session, budget };
  }

  async preview(input: { sessionId: string; model: ModelName; currency: PricingCurrency; usages: DeepSeekRawUsage[] }): Promise<UsageSummary | undefined> {
    if (!input.usages.length) return undefined;
    const turn = await this.summarizeTurn(input.model, input.currency, input.usages);
    const previous = await this.store.sessionSummary(input.sessionId, input.model, input.currency);
    const session = mergeUsageSummaries(input.model, [previous, turn], input.currency);
    const budget = await this.budget.status(input.sessionId, input.currency, turn.cost);
    return { turn, session, budget };
  }

  async estimateWorstCaseCost(input: { model: ModelName; currency: PricingCurrency; promptTokens: number; completionTokens: number }): Promise<number> {
    const { pricing, status } = await this.pricing.getPricing(input.model, input.currency);
    return summarizeUsage(input.model, {
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      total_tokens: input.promptTokens + input.completionTokens,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: input.promptTokens,
      completion_tokens_details: { reasoning_tokens: 0 }
    }, pricing, status.source).cost;
  }

  mergeTurn(model: ModelName, items: ModelUsageSummary[], currency: PricingCurrency = items[0]?.currency ?? "USD"): ModelUsageSummary {
    return mergeUsageSummaries(model, items, currency);
  }

  private async summarizeTurnForAllCurrencies(model: ModelName, usages: DeepSeekRawUsage[]): Promise<Record<PricingCurrency, ModelUsageSummary>> {
    const entries = await Promise.all(currencies.map(async (currency) => [currency, await this.summarizeTurn(model, currency, usages)] as const));
    return Object.fromEntries(entries) as Record<PricingCurrency, ModelUsageSummary>;
  }

  private async summarizeTurn(model: ModelName, currency: PricingCurrency, usages: DeepSeekRawUsage[]): Promise<ModelUsageSummary> {
    const { pricing, status } = await this.pricing.getPricing(model, currency);
    return mergeUsageSummaries(model, usages.map((usage) => summarizeUsage(model, usage, pricing, status.source)), currency);
  }
}
}

namespace __core_config_env {
import z = __ext_2.z;
let processEnvLoaded = false;

export const EnvSchema = z.object({
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_SESSION_BUDGET_CNY: z.coerce.number().positive().default(7),
  DEEPSEEK_SESSION_BUDGET_USD: z.coerce.number().positive().default(1),
  DEFAULT_MODEL: z.enum(["deepseek-v4-flash", "deepseek-v4-pro"]).default("deepseek-v4-flash"),
  DEFAULT_THINKING: z.enum(["enabled", "disabled"]).default("disabled"),
  DEFAULT_REASONING_EFFORT: z.enum(["high", "max"]).default("high"),
  MAX_TOOL_ROUNDS: z.coerce.number().int().positive().default(8),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(20),
  MAX_UPLOAD_FILE_COUNT: z.coerce.number().int().positive().default(8),
  CODE_EXECUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  CODE_EXECUTION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WEB_ACCESS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  WEB_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  WEB_FETCH_MAX_BYTES: z.coerce.number().int().positive().default(200000),
  WORKBENCH_DATA_DIR: z.string().optional(),
  WORKBENCH_PLUGIN_DIR: z.string().optional(),
  OBSIDIAN_VAULT_PATH: z.string().optional(),
  OBSIDIAN_EXPORT_FOLDER: z.string().default("AI Workbench"),
  SHOW_RAW_REASONING: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  NODE_ENV: z.string().default("development"),
  E2E_MOCK_LLM: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  E2E_MOCK_LLM_ALLOWED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function getEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (source === process.env) ensureProcessEnvLoaded();
  const env = EnvSchema.parse(source);
  return env.NODE_ENV === "production" ? env : { ...env, SHOW_RAW_REASONING: true };
}

function ensureProcessEnvLoaded(): void {
  if (processEnvLoaded) return;
  processEnvLoaded = true;
  for (const file of envCandidates()) loadEnvFileIfPresent(file);
}

function envCandidates(): string[] {
  const cwd = process.cwd();
  const sep = cwd.includes("\\") ? "\\" : "/";
  const candidates = [
    `${cwd}${sep}.env.local`,
    `${cwd}${sep}.env`,
    `${cwd}${sep}..${sep}..${sep}apps${sep}web${sep}.env.local`,
    `${cwd}${sep}..${sep}..${sep}.env.local`,
    `${cwd}${sep}..${sep}..${sep}.env`
  ];
  const override = process.env.WORKBENCH_ENV_FILE_PATH?.trim();
  return override ? [override, ...candidates] : candidates;
}

function loadEnvFileIfPresent(file: string): void {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
}
}

namespace __core_core_toolCallRepair {
import ToolCall = __ext_1.ToolCall;
import createId = __core_utils_id.createId;
export interface ToolRepairReport {
  scavenged: number;
  repairedJson: number;
  stormsBroken: number;
}

export class ToolCallRepair {
  private readonly signatures: string[] = [];

  constructor(
    private readonly allowedToolNames: Set<string>,
    private readonly options: { stormThreshold?: number; stormWindow?: number } = {}
  ) {}

  process(declared: ToolCall[], reasoning?: string | null, content?: string | null): { calls: ToolCall[]; report: ToolRepairReport } {
    const report: ToolRepairReport = { scavenged: 0, repairedJson: 0, stormsBroken: 0 };
    const calls = [...declared];
    const seen = new Set(calls.map(signature));
    for (const call of scavengeToolCalls([reasoning, content].filter(Boolean).join("\n"), this.allowedToolNames)) {
      const sig = signature(call);
      if (seen.has(sig)) continue;
      seen.add(sig);
      calls.push(call);
      report.scavenged += 1;
    }
    const filtered: ToolCall[] = [];
    for (const call of calls) {
      const sig = signature(call);
      if (this.isStorm(sig)) {
        report.stormsBroken += 1;
        continue;
      }
      this.signatures.push(sig);
      this.signatures.splice(0, Math.max(0, this.signatures.length - (this.options.stormWindow ?? 8)));
      filtered.push(call);
    }
    return { calls: filtered, report };
  }

  resetStorm(): void {
    this.signatures.length = 0;
  }

  private isStorm(sig: string): boolean {
    const threshold = this.options.stormThreshold ?? 3;
    return this.signatures.filter((entry) => entry === sig).length >= threshold;
  }
}

export function repairTruncatedJson(input: string): string | undefined {
  const text = input.trim();
  if (!text) return "{}";
  try {
    JSON.parse(text);
    return text;
  } catch {
    let repaired = text;
    repaired = repaired.replace(/,\s*$/, "");
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (const ch of repaired) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") inString = !inString;
      if (inString) continue;
      if (ch === "{") stack.push("}");
      if (ch === "[") stack.push("]");
      if ((ch === "}" || ch === "]") && stack.at(-1) === ch) stack.pop();
    }
    if (inString) repaired += "\"";
    repaired += stack.reverse().join("");
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return undefined;
    }
  }
}

function scavengeToolCalls(text: string, allowedToolNames: Set<string>): ToolCall[] {
  const calls: ToolCall[] = [];
  const tagPattern = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  for (const match of text.matchAll(tagPattern)) {
    const parsed = parseScavengedCall(match[1] ?? "", allowedToolNames);
    if (parsed) calls.push(parsed);
  }
  return calls;
}

function parseScavengedCall(raw: string, allowedToolNames: Set<string>): ToolCall | undefined {
  const repaired = repairTruncatedJson(raw);
  if (!repaired) return undefined;
  const value = JSON.parse(repaired) as { name?: unknown; tool?: unknown; function?: { name?: unknown }; arguments?: unknown; args?: unknown };
  const name = stringValue(value.name) ?? stringValue(value.tool) ?? stringValue(value.function?.name);
  if (!name || !allowedToolNames.has(name)) return undefined;
  const args = value.arguments ?? value.args ?? {};
  return {
    id: createId("repair_call"),
    type: "function",
    function: {
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args)
    }
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function signature(call: ToolCall): string {
  return `${call.function.name}:${call.function.arguments || "{}"}`;
}
}

namespace __core_core_toolRouter {
import ToolCall = __ext_1.ToolCall;
import ToolResult = __ext_1.ToolResult;
import truncate = __core_utils_id.truncate;
import repairTruncatedJson = __core_core_toolCallRepair.repairTruncatedJson;
import z = __ext_2.z;
const modelToolNamePattern = /^[A-Za-z0-9_-]{1,64}$/;

export interface ToolExecutionContext {
  requestId: string;
  conversationId?: string | null;
  signal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parallelSafe?: boolean;
  runtimeInputSchema: z.ZodType<TInput>;
  modelInputSchema: z.ZodType<unknown>;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput>;
}

export class ToolRouter {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): void {
    if (!isModelToolName(definition.name)) throw new Error(`Invalid tool name: ${definition.name}`);
    if (this.tools.has(definition.name)) throw new Error(`Tool already registered: ${definition.name}`);
    this.tools.set(definition.name, definition as ToolDefinition<unknown, unknown>);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listToolNames(): Set<string> {
    return new Set(this.tools.keys());
  }

  isParallelSafe(name: string): boolean {
    return this.tools.get(name)?.parallelSafe === true;
  }

  listModelTools() {
    return [...this.tools.values()].map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: objectRootJsonSchema(z.toJSONSchema(tool.modelInputSchema))
      }
    }));
  }

  async executeTool(call: ToolCall, ctx: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(call.function.name);
    if (!tool) {
      return this.error(call, call.function.name, "TOOL_NOT_REGISTERED", "Tool is not registered");
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(call.function.arguments || "{}");
    } catch {
      const repaired = repairTruncatedJson(call.function.arguments || "{}");
      if (!repaired) return this.error(call, tool.name, "TOOL_ARGUMENTS_INVALID_JSON", "Tool arguments are not valid JSON");
      try {
        parsedJson = JSON.parse(repaired);
      } catch {
        return this.error(call, tool.name, "TOOL_ARGUMENTS_INVALID_JSON", "Tool arguments are not valid JSON");
      }
    }
    const parsed = tool.runtimeInputSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return this.error(call, tool.name, "TOOL_ARGUMENTS_SCHEMA_MISMATCH", z.prettifyError(parsed.error));
    }
    const start = Date.now();
    try {
      const result = await tool.execute(parsed.data, ctx);
      const content = JSON.stringify(result);
      return {
        ok: true,
        toolCallId: call.id,
        toolName: tool.name,
        content,
        summary: truncate(content),
        error: undefined
      };
    } catch (error) {
      const duration = Date.now() - start;
      return this.error(
        call,
        tool.name,
        "TOOL_EXECUTION_FAILED",
        `${error instanceof Error ? error.message : String(error)} (${duration}ms)`,
        false
      );
    }
  }

  private error(call: ToolCall, toolName: string, code: string, message: string, recoverable = true): ToolResult {
    return {
      ok: false,
      toolCallId: call.id,
      toolName,
      content: JSON.stringify({ error: { code, message, recoverable } }),
      summary: message,
      error: { code, message, recoverable }
    };
  }
}

export function isModelToolName(name: string): boolean {
  return modelToolNamePattern.test(name);
}

function objectRootJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { type: "object" };
  const candidate = schema as Record<string, unknown>;
  if (candidate.type === "object") return candidate;
  if (candidate.anyOf || candidate.oneOf || candidate.allOf || candidate.properties) return { ...candidate, type: "object" };
  return candidate;
}
}

namespace __core_tools_web_defaults {

export const DEFAULT_TOP_K = 5;
export const DEFAULT_MAX_SEARCH_RESULTS = 10;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MAX_CHARS = 32_000;
export const DEFAULT_MAX_REDIRECTS = 5;

export function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}
}

namespace __core_tools_webFetchTool {
import z = __ext_2.z;
import AppEnv = __core_config_env.AppEnv;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
import DEFAULT_MAX_CHARS = __core_tools_web_defaults.DEFAULT_MAX_CHARS;
import DEFAULT_MAX_REDIRECTS = __core_tools_web_defaults.DEFAULT_MAX_REDIRECTS;
import FetchOptions = __core_tools_web_types.FetchOptions;
import WebSearchStackConfig = __core_tools_web_types.WebSearchStackConfig;
const fetchSchema = z.object({
  url: z.string().url(),
  maxBytes: z.number().int().positive().optional()
});

export interface WebFetchOutput {
  url: string;
  text: string;
}

export function createWebFetchTool(
  env: AppEnv,
  config: Pick<WebSearchStackConfig, "fetcher" | "defaults"> = {}
): ToolDefinition<z.infer<typeof fetchSchema>, WebFetchOutput> {
  const fetcher = config.fetcher ?? createDefaultPageFetcher();
  return {
    name: "web_fetch",
    description: "Fetch a public http(s) URL when web access is enabled. Returns sanitized text.",
    runtimeInputSchema: fetchSchema,
    modelInputSchema: fetchSchema,
    async execute(input, ctx) {
      ensureEnabled(env);
      const url = new URL(input.url);
      const fetchOptions: FetchOptions = {
        timeoutMs: config.defaults?.timeoutMs ?? env.WEB_FETCH_TIMEOUT_MS,
        maxBytes: input.maxBytes ?? config.defaults?.maxBytes ?? env.WEB_FETCH_MAX_BYTES,
        maxChars: config.defaults?.maxChars ?? DEFAULT_MAX_CHARS,
        maxRedirects: config.defaults?.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
        mainContentOnly: config.defaults?.mainContentOnly ?? true
      };
      if (ctx.signal) {
        fetchOptions.signal = ctx.signal;
      }
      const page = await fetcher.fetch(url.toString(), fetchOptions);
      return { url: url.toString(), text: page.content };
    }
  };
}

function createDefaultPageFetcher(): { fetch(url: string, options?: FetchOptions): Promise<{ url: string; content: string }> } {
  return {
    async fetch(url: string, options: FetchOptions = {}) {
      const FetcherCtor = (__core_tools_web_fetcher_http as unknown as {
        HttpPageFetcher?: new () => { fetch(url: string, options?: FetchOptions): Promise<{ url: string; content: string }> };
      })?.HttpPageFetcher;
      if (typeof FetcherCtor === "function") {
        return new FetcherCtor().fetch(url, options);
      }
      const response = await fetch(url, {
        redirect: "follow",
        ...(options.signal ? { signal: options.signal } : {})
      });
      const content = await response.text();
      return { url: response.url || url, content };
    }
  };
}

const searchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(8).default(5)
});

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string | undefined;
}

export interface SearchSourceResult {
  query: string;
  source: string;
  results: SearchResultItem[];
  answer?: string | undefined;
  attemptedProviders?: string[] | undefined;
  failures?: ProviderFailure[] | undefined;
}

export function createWebSearchTool(
  env: AppEnv,
  config: Pick<WebSearchStackConfig, "providers" | "providerOrder" | "env" | "defaults"> = {}
): ToolDefinition<z.infer<typeof searchSchema>, SearchSourceResult> {
  const registry = createSearchRegistry(config);
  return {
    name: "web_search",
    description: "Search the public web when web access is enabled. Use for latest/current information and cite returned URLs.",
    runtimeInputSchema: searchSchema,
    modelInputSchema: searchSchema,
    async execute(input, ctx) {
      ensureEnabled(env);
      const searchOptions: SearchOptions = {
        topK: input.maxResults,
        maxResults: config.defaults?.maxSearchResults ?? input.maxResults
      };
      if (ctx.signal) {
        searchOptions.signal = ctx.signal;
      }
      const response = await registry.search(input.query, searchOptions);
      const result: SearchSourceResult = {
        query: response.query,
        source: response.providerId ?? response.attemptedProviders.at(-1) ?? "none",
        results: response.results.slice(0, input.maxResults).map(toSearchResultItem)
      };
      if (response.attemptedProviders.length > 0) {
        result.attemptedProviders = response.attemptedProviders;
      }
      if (response.failures.length > 0) {
        result.failures = response.failures;
      }
      return result;
    }
  };
}

function ensureEnabled(env: AppEnv): void {
  if (!env.WEB_ACCESS_ENABLED) throw new Error("WEB_ACCESS_ENABLED=false. Web access is disabled.");
}

function createSearchRegistry(config: Pick<WebSearchStackConfig, "providers" | "providerOrder" | "env">): {
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
} {
  const RegistryCtor = (__core_tools_web_providers_registry as unknown as {
    SearchProviderRegistry?: {
      fromEnv(env?: Record<string, string | undefined>): {
        enabledProviders(): SearchProvider[];
      };
      new (providers: SearchProvider[], providerOrder?: string[]): {
        search(query: string, options?: SearchOptions): Promise<SearchResponse>;
      };
    };
  })?.SearchProviderRegistry;
  if (typeof RegistryCtor === "function") {
    const providers = config.providers ?? RegistryCtor.fromEnv(config.env).enabledProviders();
    return new RegistryCtor(providers, config.providerOrder);
  }
  return {
    async search(query: string): Promise<SearchResponse> {
      return {
        query,
        results: [{
          title: `Search fallback: ${query}`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `Fallback search result for ${query}`,
          source: "fallback"
        }],
        providerId: "fallback",
        attemptedProviders: ["fallback"],
        failures: []
      };
    }
  };
}

function sanitizeText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+([,.;:!?，。；：！？])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

function toSearchResultItem(result: { title: string; url: string; snippet?: string | undefined }): SearchResultItem {
  const item: SearchResultItem = { title: result.title, url: result.url };
  if (result.snippet) {
    item.snippet = result.snippet;
  }
  return item;
}

export function parseBing(html: string): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  const blockPattern = /<li class="b_algo"[\s\S]*?<\/li>/g;
  for (const block of html.match(blockPattern) ?? []) {
    const link = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    results.push({
      title: sanitizeText(link[2] ?? ""),
      url: decodeHtml(link[1] ?? ""),
      snippet: sanitizeText(snippet?.[1] ?? "")
    });
  }
  return results;
}

export function parseDuckDuckGo(html: string): SearchResultItem[] {
  try {
    return parseDuckDuckGoHtmlResults(html).map((result) =>
      toSearchResultItem({ ...result, url: trimBareOriginSlash(result.url) })
    );
  } catch {
    return [];
  }
}

function trimBareOriginSlash(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" && !parsed.search && !parsed.hash ? `${parsed.protocol}//${parsed.host}` : url;
  } catch {
    return url;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
}

namespace __core_tools_web_types {

export type SearchSource = "duckduckgo" | string;

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string | undefined;
  source: SearchSource;
}

export interface SearchOptions {
  topK?: number;
  maxResults?: number;
  signal?: AbortSignal;
}

export interface ProviderUserAction {
  type: "complete_human_verification";
  message: string;
  retryAfterUserAction: boolean;
}

export interface ProviderDiagnostics {
  finalUrl?: string;
  pageTitle?: string;
  bodyTextPreview?: string;
  resultLikeClassNames?: string[];
  sampleClassNames?: string[];
  anchorCount?: number;
  resultContainerCount?: number;
  responseStatus?: number;
}

export interface ProviderFailure {
  providerId: string;
  code: string;
  message: string;
  retryable?: boolean;
  error?: string;
  diagnostics?: ProviderDiagnostics;
  userAction?: ProviderUserAction;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  providerId?: string | null;
  attemptedProviders: string[];
  failures: ProviderFailure[];
}

export interface SearchProvider {
  readonly id: string;
  readonly configured: boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxChars?: number;
  maxRedirects?: number;
  mainContentOnly?: boolean;
  selector?: string;
  signal?: AbortSignal;
}

export type PageContentFormat = "text" | "markdown" | "html" | "json";

export interface PageContent {
  url: string;
  finalUrl?: string;
  title?: string;
  content: string;
  format: PageContentFormat;
  truncated: boolean;
  fetchedAt: string;
  source?: string;
}

export interface PageFetcher {
  fetch(url: string, options?: FetchOptions): Promise<PageContent>;
}

export interface WebSearchStackConfig {
  providerOrder?: string[];
  providers?: SearchProvider[];
  fetcher?: PageFetcher;
  env?: Record<string, string | undefined>;
  defaults?: {
    topK?: number;
    maxSearchResults?: number;
    timeoutMs?: number;
    maxBytes?: number;
    maxChars?: number;
    maxRedirects?: number;
    mainContentOnly?: boolean;
  };
}
}

namespace __core_tools_web_errors {
import ProviderDiagnostics = __core_tools_web_types.ProviderDiagnostics;
import ProviderUserAction = __core_tools_web_types.ProviderUserAction;
export class WebSearchToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebSearchToolError";
  }
}

export class FetchSecurityError extends WebSearchToolError {
  constructor(message: string) {
    super(message);
    this.name = "FetchSecurityError";
  }
}

export class ProviderSearchError extends WebSearchToolError {
  readonly code: string;
  readonly retryable: boolean | undefined;
  readonly diagnostics: ProviderDiagnostics | undefined;
  readonly userAction: ProviderUserAction | undefined;

  constructor(
    message: string,
    options: { code: string; retryable?: boolean; diagnostics?: ProviderDiagnostics; userAction?: ProviderUserAction }
  ) {
    super(message);
    this.name = "ProviderSearchError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.diagnostics = options.diagnostics;
    this.userAction = options.userAction;
  }
}
}

namespace __core_tools_web_providers_duckduckgo {
import DEFAULT_MAX_SEARCH_RESULTS = __core_tools_web_defaults.DEFAULT_MAX_SEARCH_RESULTS;
import clampPositiveInteger = __core_tools_web_defaults.clampPositiveInteger;
import ProviderSearchError = __core_tools_web_errors.ProviderSearchError;
import ProviderDiagnostics = __core_tools_web_types.ProviderDiagnostics;
import SearchOptions = __core_tools_web_types.SearchOptions;
import SearchProvider = __core_tools_web_types.SearchProvider;
import SearchResult = __core_tools_web_types.SearchResult;
export interface DuckDuckGoProviderConfig {
  disabled?: boolean;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
  minRequestIntervalMs?: number;
  retryCount?: number;
  retryBackoffMs?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
}

export interface DuckDuckGoParseContext {
  finalUrl?: string;
  responseStatus?: number;
}

const BLOCK_PATTERNS = [
  /captcha/i,
  /access denied/i,
  /blocked/i,
  /unusual traffic/i,
  /automated queries/i,
  /verify you are human/i,
  /anomaly detected/i
];
const EMPTY_PATTERNS = [/no results/i, /not many results/i, /did not find results/i];
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 4000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_BACKOFF_MS = 1000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 100;
const RESULT_CLASS_RE = /result|web-result|links|snippet/i;

export class DuckDuckGoHtmlProvider implements SearchProvider {
  readonly id = "duckduckgo";
  readonly configured: boolean;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly delay: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly minRequestIntervalMs: number;
  private readonly retryCount: number;
  private readonly retryBackoffMs: number;
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly cache = new Map<string, { expiresAt: number; results: SearchResult[] }>();
  private readonly inFlight = new Map<string, Promise<SearchResult[]>>();
  private throttleQueue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(config: DuckDuckGoProviderConfig = {}) {
    this.endpoint = config.endpoint ?? "https://html.duckduckgo.com/html/";
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.delay = config.delay ?? sleep;
    this.minRequestIntervalMs = Math.max(0, config.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS);
    this.retryCount = Math.max(0, Math.floor(config.retryCount ?? DEFAULT_RETRY_COUNT));
    this.retryBackoffMs = Math.max(0, config.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS);
    this.cacheTtlMs = Math.max(0, config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.cacheMaxEntries = Math.max(0, Math.floor(config.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES));
    this.configured = !config.disabled;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.configured) {
      throw new ProviderSearchError("DuckDuckGo HTML provider is disabled", {
        code: "not_configured",
        retryable: false
      });
    }

    const count = clampPositiveInteger(options.maxResults, DEFAULT_MAX_SEARCH_RESULTS);
    const cacheKey = cacheKeyFor(query, count);
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached.slice();
    }

    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      return (await existing).slice();
    }

    const request = this.searchWithRetry(query, count, options.signal)
      .then((results) => {
        this.setCached(cacheKey, results);
        return results;
      })
      .finally(() => {
        this.inFlight.delete(cacheKey);
      });
    this.inFlight.set(cacheKey, request);
    return (await request).slice();
  }

  private async searchWithRetry(query: string, count: number, signal?: AbortSignal): Promise<SearchResult[]> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        if (attempt > 0 && this.retryBackoffMs > 0) {
          await this.delay(this.retryBackoffMs * attempt, signal);
        }
        return await this.searchOnce(query, count, signal);
      } catch (error) {
        lastError = error;
        if (attempt >= this.retryCount || !isRetryableSearchError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async searchOnce(query: string, count: number, signal?: AbortSignal): Promise<SearchResult[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set("q", query);

    await this.waitForRequestSlot(signal);

    const requestInit: RequestInit = {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
      }
    };
    if (signal) {
      requestInit.signal = signal;
    }
    const response = await this.fetchImpl(url, requestInit);
    const finalUrl = response.url || url.toString();

    if (!response.ok) {
      throw new ProviderSearchError(`DuckDuckGo HTML search failed with HTTP ${response.status}`, {
        code: "http_error",
        retryable: response.status >= 500 || response.status === 429,
        diagnostics: { responseStatus: response.status, finalUrl }
      });
    }

    return parseDuckDuckGoHtmlResults(await response.text(), count, url, {
      finalUrl,
      responseStatus: response.status
    });
  }

  private async waitForRequestSlot(signal?: AbortSignal): Promise<void> {
    const queued = this.throttleQueue.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextRequestAt - now);
      if (waitMs > 0) {
        await this.delay(waitMs, signal);
      }
      this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
    });

    this.throttleQueue = queued.catch(() => undefined);
    await queued;
  }

  private getCached(cacheKey: string): SearchResult[] | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    return entry.results.map((result) => ({ ...result }));
  }

  private setCached(cacheKey: string, results: SearchResult[]): void {
    if (this.cacheTtlMs <= 0 || this.cacheMaxEntries <= 0) {
      return;
    }
    if (this.cache.size >= this.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + this.cacheTtlMs,
      results: results.map((result) => ({ ...result }))
    });
  }
}

export function parseDuckDuckGoHtmlResults(
  html: string,
  maxResults = DEFAULT_MAX_SEARCH_RESULTS,
  baseUrl = new URL("https://html.duckduckgo.com/html/"),
  context: DuckDuckGoParseContext = {}
): SearchResult[] {
  const pageText = cleanText(stripTags(html));
  const title = cleanText(stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));

  if (isLikelyBlockPage(title, pageText, html)) {
    throw new ProviderSearchError("DuckDuckGo returned a likely anti-bot or block page", {
      code: "blocked",
      retryable: true,
      diagnostics: createDiagnostics(html, pageText, title, context)
    });
  }

  const results = collectResultCandidates(html, maxResults, baseUrl);
  if (results.length > 0) {
    return results;
  }

  if (EMPTY_PATTERNS.some((pattern) => pattern.test(pageText))) {
    return [];
  }

  throw new ProviderSearchError("DuckDuckGo response did not contain recognizable search results", {
    code: "parse_error",
    retryable: true,
    diagnostics: createDiagnostics(html, pageText, title, context)
  });
}

function collectResultCandidates(html: string, maxResults: number, baseUrl: URL): SearchResult[] {
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const blocks = collectResultBlocks(html);

  for (const block of blocks) {
    const anchor = findResultAnchor(block);
    if (!anchor) {
      continue;
    }
    const title = cleanText(stripTags(anchor.text));
    const url = normalizeDuckDuckGoUrl(decodeHtml(anchor.href), baseUrl.toString());
    if (!title || !url || seen.has(url)) {
      continue;
    }

    const snippet = extractSnippet(block, title);
    const result: SearchResult = { title, url, source: "duckduckgo" };
    if (snippet) {
      result.snippet = snippet;
    }
    results.push(result);
    seen.add(url);

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

function collectResultBlocks(html: string): string[] {
  const blocks: string[] = [];
  const blockPattern = /<([a-z0-9:-]+)\b([^>]*class\s*=\s*(["'])(?=[^"']*(?:result|web-result|links|snippet))[\s\S]*?\3[^>]*)>[\s\S]*?<\/\1>/gi;
  for (const match of html.matchAll(blockPattern)) {
    blocks.push(match[0]);
  }
  const anchorPattern = /<a\b[^>]*class\s*=\s*(["'])(?=[^"']*result)[\s\S]*?\1[^>]*>[\s\S]*?<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    blocks.push(match[0]);
  }
  return blocks;
}

function findResultAnchor(block: string): { href: string; text: string } | null {
  const preferred =
    findAnchor(block, /class\s*=\s*(["'])(?=[^"']*(?:result__a|result-link|result-title-a))[\s\S]*?\1/i) ??
    findAnchor(block, /class\s*=\s*(["'])(?=[^"']*result)[\s\S]*?\1/i);
  return preferred ?? findAnchor(block, /href\s*=/i);
}

function findAnchor(block: string, attrPattern: RegExp): { href: string; text: string } | null {
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of block.matchAll(anchorPattern)) {
    const attrs = match[1] ?? "";
    if (!attrPattern.test(attrs)) {
      continue;
    }
    const href = attrs.match(/\shref\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
    if (href) {
      return { href, text: match[2] ?? "" };
    }
  }
  return null;
}

function normalizeDuckDuckGoUrl(href: string, baseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return null;
  }

  const target = url.searchParams.get("uddg");
  if (target) {
    try {
      url = new URL(target);
    } catch {
      return null;
    }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (/(^|\.)duckduckgo\.com$/i.test(url.hostname) && !url.searchParams.has("uddg")) {
    return null;
  }
  return url.toString();
}

function extractSnippet(block: string, title: string): string | undefined {
  const snippetPattern =
    /<([a-z0-9:-]+)\b[^>]*class\s*=\s*(["'])(?=[^"']*(?:result__snippet|snippet|result-snippet))[\s\S]*?\2[^>]*>([\s\S]*?)<\/\1>/i;
  const snippet = cleanText(stripTags(block.match(snippetPattern)?.[3] ?? ""));
  if (snippet && snippet !== title) {
    return snippet;
  }

  const fallback = cleanText(stripTags(block)).replace(title, "").trim();
  return fallback ? fallback.slice(0, 500) : undefined;
}

function isLikelyBlockPage(title: string, pageText: string, html: string): boolean {
  const combined = `${title}\n${pageText}`;
  if (BLOCK_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }
  return collectResultBlocks(html).length === 0 && /security check|enable javascript/i.test(combined);
}

function createDiagnostics(
  html: string,
  pageText: string,
  pageTitle: string,
  context: DuckDuckGoParseContext
): ProviderDiagnostics {
  const classNames = uniqueBounded(
    Array.from(html.matchAll(/\sclass\s*=\s*(["'])([\s\S]*?)\1/gi)).flatMap((match) =>
      (match[2] ?? "").split(/\s+/).filter(Boolean)
    ),
    20
  );
  const diagnostics: ProviderDiagnostics = {
    pageTitle: boundedString(pageTitle, 200),
    bodyTextPreview: boundedString(pageText, 300),
    resultLikeClassNames: classNames.filter((name) => RESULT_CLASS_RE.test(name)),
    sampleClassNames: classNames,
    anchorCount: Array.from(html.matchAll(/<a\b[^>]*href\s*=/gi)).length,
    resultContainerCount: collectResultBlocks(html).length
  };
  if (context.finalUrl) {
    diagnostics.finalUrl = boundedString(context.finalUrl, 500);
  }
  if (context.responseStatus !== undefined) {
    diagnostics.responseStatus = context.responseStatus;
  }
  return diagnostics;
}

function uniqueBounded(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(boundedString(value, 80));
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function boundedString(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function cacheKeyFor(query: string, maxResults: number): string {
  return `${query.replace(/\s+/g, " ").trim().toLowerCase()}\u0000${maxResults}`;
}

function isRetryableSearchError(error: unknown): boolean {
  if (error instanceof ProviderSearchError) {
    return error.retryable === true;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }
  return true;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function cleanText(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
}

namespace __core_tools_web_providers_registry {
import DEFAULT_MAX_SEARCH_RESULTS = __core_tools_web_defaults.DEFAULT_MAX_SEARCH_RESULTS;
import DEFAULT_TOP_K = __core_tools_web_defaults.DEFAULT_TOP_K;
import clampPositiveInteger = __core_tools_web_defaults.clampPositiveInteger;
import ProviderSearchError = __core_tools_web_errors.ProviderSearchError;
import ProviderFailure = __core_tools_web_types.ProviderFailure;
import SearchOptions = __core_tools_web_types.SearchOptions;
import SearchProvider = __core_tools_web_types.SearchProvider;
import SearchResponse = __core_tools_web_types.SearchResponse;
import DuckDuckGoHtmlProvider = __core_tools_web_providers_duckduckgo.DuckDuckGoHtmlProvider;
export const DEFAULT_PROVIDER_ORDER = ["duckduckgo"] as const;

export class SearchProviderRegistry {
  private readonly providers: Map<string, SearchProvider>;
  private readonly providerOrder: string[];

  constructor(providers: SearchProvider[], providerOrder?: string[]) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.providerOrder = providerOrder ?? mergeDefaultOrder(providers);
  }

  static fromEnv(env: Record<string, string | undefined> = process.env): SearchProviderRegistry {
    return new SearchProviderRegistry([new DuckDuckGoHtmlProvider({ disabled: isDisabled(env.DUCKDUCKGO_DISABLED) })]);
  }

  enabledProviders(): SearchProvider[] {
    return this.providerOrder
      .map((id) => this.providers.get(id))
      .filter((provider): provider is SearchProvider => Boolean(provider?.configured));
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const failures: ProviderFailure[] = [];
    const attemptedProviders: string[] = [];
    const maxResults = clampPositiveInteger(options.maxResults, DEFAULT_MAX_SEARCH_RESULTS);
    const topK = Math.min(clampPositiveInteger(options.topK, DEFAULT_TOP_K), maxResults);
    const providers = this.enabledProviders();

    if (providers.length === 0) {
      return {
        query,
        results: [],
        providerId: null,
        attemptedProviders,
        failures: [providerFailure("registry", "not_configured", "No configured search providers", false)]
      };
    }

    for (const provider of providers) {
      attemptedProviders.push(provider.id);
      try {
        const results = await provider.search(query, { ...options, maxResults });
        const sliced = results.slice(0, topK);
        if (sliced.length > 0) {
          return {
            query,
            results: sliced,
            providerId: provider.id,
            attemptedProviders,
            failures
          };
        }
      } catch (error) {
        failures.push(providerFailureFromError(provider.id, error));
      }
    }

    return { query, results: [], providerId: null, attemptedProviders, failures };
  }
}

function providerFailure(
  providerId: string,
  code: string,
  message: string,
  retryable?: boolean,
  diagnostics?: ProviderFailure["diagnostics"],
  userAction?: ProviderFailure["userAction"]
): ProviderFailure {
  const failure: ProviderFailure = { providerId, code, message, error: message };
  if (retryable !== undefined) {
    failure.retryable = retryable;
  }
  if (diagnostics) {
    failure.diagnostics = diagnostics;
  }
  if (userAction) {
    failure.userAction = userAction;
  }
  return failure;
}

function providerFailureFromError(providerId: string, error: unknown): ProviderFailure {
  if (error instanceof ProviderSearchError) {
    return providerFailure(providerId, error.code, error.message, error.retryable, error.diagnostics, error.userAction);
  }
  const message = error instanceof Error ? error.message : String(error);
  return providerFailure(providerId, "provider_error", message, true);
}

function isDisabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function mergeDefaultOrder(providers: SearchProvider[]): string[] {
  const defaultOrder = [...DEFAULT_PROVIDER_ORDER] as string[];
  const ids = providers.map((provider) => provider.id);
  return [...defaultOrder, ...ids.filter((id) => !defaultOrder.includes(id))];
}
}

namespace __core_tools_web_fetcher_security {
import lookup = __ext_3.lookup;
import isIP = __ext_4.isIP;
import FetchSecurityError = __core_tools_web_errors.FetchSecurityError;
const LOCAL_NAMES = new Set(["localhost", "localhost.localdomain"]);

export async function assertPublicHttpUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FetchSecurityError(`Invalid URL: ${value}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchSecurityError(`Only http and https URLs are allowed: ${url.protocol}`);
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || LOCAL_NAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new FetchSecurityError(`Blocked local hostname: ${url.hostname}`);
  }

  const version = isIP(hostname);
  const addresses = version ? [{ address: hostname, family: version }] : await lookup(hostname, { all: true, verbatim: true });

  for (const address of addresses) {
    if (isBlockedAddress(address.address)) {
      throw new FetchSecurityError(`Blocked private or local address: ${address.address}`);
    }
  }

  return url;
}

export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isBlockedIpv4(address);
  }
  if (version === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const first = parts[0] as number;
  const second = parts[1] as number;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) {
    return isBlockedIpv4(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}
}

namespace __core_tools_web_extract_html {

export interface ExtractHtmlOptions {
  maxChars: number;
  mainContentOnly?: boolean;
  selector?: string;
}

export interface ExtractedContent {
  title?: string;
  content: string;
  truncated: boolean;
}

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const REMOVE_TAGS = ["script", "style", "noscript", "template", "svg", "iframe", "canvas"];
const MAIN_CONTENT_REMOVE = ["nav", "footer", "aside", "header", "form", "button"];

export function extractHtml(html: string, options: ExtractHtmlOptions): ExtractedContent {
  const title = cleanText(decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  let body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;

  body = removeElements(body, REMOVE_TAGS);
  body = removeHiddenElements(body);

  if (options.mainContentOnly) {
    body = removeElements(body, MAIN_CONTENT_REMOVE);
    body = findContentRoot(body);
  }

  const nodes = options.selector ? selectNodes(body, options.selector) : [body];
  const rendered = normalizeMarkdown(nodes.map(renderHtml).filter(Boolean).join("\n\n"));
  const truncated = rendered.length > options.maxChars;
  const result: ExtractedContent = {
    content: truncated ? rendered.slice(0, options.maxChars) : rendered,
    truncated
  };
  if (title) {
    result.title = title;
  }
  return result;
}

function removeElements(html: string, tags: string[]): string {
  let output = html;
  for (const tag of tags) {
    output = output.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), " ");
  }
  return output.replace(/<!--[\s\S]*?-->/g, " ");
}

function removeHiddenElements(html: string): string {
  return html.replace(
    /<([a-z0-9:-]+)\b([^>]*(?:\shidden(?:\s|=|>|$)|aria-hidden\s*=|style\s*=)[^>]*)>[\s\S]*?<\/\1>/gi,
    (full, _tag: string, attrs: string) => (isHiddenAttributes(attrs) ? " " : full)
  );
}

function isHiddenAttributes(attrs: string): boolean {
  if (/\s(?:hidden|aria-hidden\s*=\s*["']?true["']?)(?:\s|=|>|$)/i.test(attrs)) {
    return true;
  }
  const style = attrs.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? "";
  return /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|(?:height|width)\s*:\s*0(?:px|em|rem|vh|vw|%)?)/i.test(
    style
  );
}

function findContentRoot(html: string): string {
  const preferred =
    firstElementByTag(html, "article") ??
    firstElementByTag(html, "main") ??
    firstElementByAttribute(html, /\srole\s*=\s*(["'])main\1/i);
  if (preferred) {
    return preferred;
  }
  return html;
}

function firstElementByTag(html: string, tag: string): string | null {
  return html.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "i"))?.[0] ?? null;
}

function firstElementByAttribute(html: string, attrPattern: RegExp): string | null {
  const pattern = /<([a-z0-9:-]+)\b([^>]*)>[\s\S]*?<\/\1>/gi;
  for (const match of html.matchAll(pattern)) {
    if (attrPattern.test(match[2] ?? "")) {
      return match[0];
    }
  }
  return null;
}

function selectNodes(html: string, selector: string): string[] {
  const trimmed = selector.trim();
  if (!trimmed) {
    return [html];
  }
  if (trimmed.startsWith(".")) {
    return elementsMatchingAttribute(html, new RegExp(`(?:^|\\s)${escapeRegExp(trimmed.slice(1))}(?:\\s|$)`), "class");
  }
  if (trimmed.startsWith("#")) {
    return elementsMatchingAttribute(html, new RegExp(`^${escapeRegExp(trimmed.slice(1))}$`), "id");
  }
  if (/^[a-z][a-z0-9-]*$/i.test(trimmed)) {
    return Array.from(html.matchAll(new RegExp(`<${trimmed}\\b[^>]*>[\\s\\S]*?<\\/${trimmed}>`, "gi")), (match) => match[0]);
  }
  return [];
}

function elementsMatchingAttribute(html: string, valuePattern: RegExp, attrName: string): string[] {
  const results: string[] = [];
  const pattern = /<([a-z0-9:-]+)\b([^>]*)>[\s\S]*?<\/\1>/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[2] ?? "";
    const attr = attrs.match(new RegExp(`\\s${attrName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2] ?? "";
    if (valuePattern.test(attr)) {
      results.push(match[0]);
    }
  }
  return results;
}

function renderHtml(html: string): string {
  return html
    .replace(/<br\b[^>]*\/?>/gi, "\n")
    .replace(/<hr\b[^>]*\/?>/gi, "\n---\n")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_full, depth: string, content: string) => {
      return `\n${"#".repeat(Number(depth))} ${stripTags(content)}\n\n`;
    })
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_full, content: string) => `\n- ${stripTags(content)}\n`)
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_full, content: string) => `\n${stripTags(content)}\n\n`)
    .replace(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_full, _quote: string, href: string, text: string) => {
      const label = stripTags(text);
      return label && href ? `[${label}](${decodeHtml(href)})` : label;
    })
    .replace(/<[^>]+>/g, " ");
}

function stripTags(value: string): string {
  return cleanText(decodeHtml(value.replace(/<[^>]+>/g, " ")));
}

function normalizeMarkdown(value: string): string {
  return decodeHtml(value)
    .replace(ZERO_WIDTH_RE, "")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(value: string): string {
  return value.replace(ZERO_WIDTH_RE, "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
}

namespace __core_tools_web_fetcher_http {
import DEFAULT_MAX_BYTES = __core_tools_web_defaults.DEFAULT_MAX_BYTES;
import DEFAULT_MAX_CHARS = __core_tools_web_defaults.DEFAULT_MAX_CHARS;
import DEFAULT_MAX_REDIRECTS = __core_tools_web_defaults.DEFAULT_MAX_REDIRECTS;
import DEFAULT_TIMEOUT_MS = __core_tools_web_defaults.DEFAULT_TIMEOUT_MS;
import clampPositiveInteger = __core_tools_web_defaults.clampPositiveInteger;
import WebSearchToolError = __core_tools_web_errors.WebSearchToolError;
import extractHtml = __core_tools_web_extract_html.extractHtml;
import FetchOptions = __core_tools_web_types.FetchOptions;
import PageContent = __core_tools_web_types.PageContent;
import PageFetcher = __core_tools_web_types.PageFetcher;
import assertPublicHttpUrl = __core_tools_web_fetcher_security.assertPublicHttpUrl;
export class HttpPageFetcher implements PageFetcher {
  async fetch(url: string, options: FetchOptions = {}): Promise<PageContent> {
    const timeoutMs = clampPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    const maxBytes = clampPositiveInteger(options.maxBytes, DEFAULT_MAX_BYTES);
    const maxChars = clampPositiveInteger(options.maxChars, DEFAULT_MAX_CHARS);
    const maxRedirects = Math.max(0, Math.floor(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS));
    const fetchedAt = new Date().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = mergeSignals(controller.signal, options.signal);

    try {
      const response = await fetchWithRedirects(url, { signal, maxRedirects });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await readLimitedText(response, maxBytes);
      const extractOptions: { maxChars: number; mainContentOnly?: boolean; selector?: string } = { maxChars };
      if (options.mainContentOnly !== undefined) {
        extractOptions.mainContentOnly = options.mainContentOnly;
      }
      if (options.selector !== undefined) {
        extractOptions.selector = options.selector;
      }
      const extracted = extractByContentType(body.text, contentType, extractOptions);

      const page: PageContent = {
        url,
        content: extracted.content,
        format: extracted.format,
        truncated: body.truncated || extracted.truncated,
        fetchedAt
      };
      if (response.url && response.url !== url) {
        page.finalUrl = response.url;
      }
      if (extracted.title) {
        page.title = extracted.title;
      }
      return page;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function fetchWithRedirects(
  url: string,
  options: { signal: AbortSignal; maxRedirects: number }
): Promise<Response> {
  let current = (await assertPublicHttpUrl(url)).toString();

  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: options.signal,
      headers: {
        Accept: "text/html, application/json;q=0.9, text/plain;q=0.8, */*;q=0.5",
        "User-Agent": "Pinocchio/0.1"
      }
    });

    if (!isRedirect(response.status)) {
      if (!response.ok) {
        throw new WebSearchToolError(`Fetch failed with HTTP ${response.status}`);
      }
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new WebSearchToolError(`Redirect ${response.status} missing Location header`);
    }
    if (hop === options.maxRedirects) {
      throw new WebSearchToolError(`Too many redirects; limit is ${options.maxRedirects}`);
    }

    current = (await assertPublicHttpUrl(new URL(location, current).toString())).toString();
  }

  throw new WebSearchToolError(`Too many redirects; limit is ${options.maxRedirects}`);
}

async function readLimitedText(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    return { text: await response.text(), truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    const remaining = maxBytes - received;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value);
    received += Math.min(value.byteLength, remaining);
    if (value.byteLength > remaining) {
      truncated = true;
      break;
    }
  }

  await reader.cancel().catch(() => undefined);
  return { text: new TextDecoder().decode(concat(chunks, received)), truncated };
}

function extractByContentType(
  text: string,
  contentType: string,
  options: { maxChars: number; mainContentOnly?: boolean; selector?: string }
): { title?: string; content: string; format: "text" | "markdown" | "json"; truncated: boolean } {
  if (contentType.includes("json")) {
    return extractJson(text, options.maxChars);
  }
  if (contentType.includes("html") || looksLikeHtml(text)) {
    const extractOptions: { maxChars: number; mainContentOnly?: boolean; selector?: string } = { maxChars: options.maxChars };
    if (options.mainContentOnly !== undefined) {
      extractOptions.mainContentOnly = options.mainContentOnly;
    }
    if (options.selector !== undefined) {
      extractOptions.selector = options.selector;
    }
    const html = extractHtml(text, extractOptions);
    return { ...html, format: "markdown" };
  }
  return { ...extractPlainText(text, options.maxChars), format: "text" };
}

function extractJson(text: string, maxChars: number): { content: string; format: "json"; truncated: boolean } {
  let pretty = text.trim();
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    pretty = text.trim();
  }

  pretty = pretty.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const truncated = pretty.length > maxChars;
  return { content: truncated ? pretty.slice(0, maxChars) : pretty, format: "json", truncated };
}

function extractPlainText(text: string, maxChars: number): { content: string; truncated: boolean } {
  const normalized = text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  const truncated = normalized.length > maxChars;
  return { content: truncated ? normalized.slice(0, maxChars) : normalized, truncated };
}

function looksLikeHtml(text: string): boolean {
  return /^\s*<(?:!doctype\s+html|html|head|body|main|article|section|div|p)\b/i.test(text);
}

function concat(chunks: Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function mergeSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) {
    return primary;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return controller.signal;
}
}

namespace __core_canvas_canvasDeck {
import existsSync = __ext_5.existsSync;
import readFileSync = __ext_5.readFileSync;
const path = __default_0;
import CanvasBlock = __ext_1.CanvasBlock;
import DeckSlideSpec = __ext_1.DeckSlideSpec;
import DeckSpec = __ext_1.DeckSpec;
import createId = __core_utils_id.createId;
const defaultSkillRoot = "O:\\any_skills\\html-ppt-skill-main";
const themeIds = [
  "minimal-white",
  "corporate-clean",
  "swiss-grid",
  "tokyo-night",
  "editorial-serif",
  "soft-pastel",
  "pitch-deck-vc",
  "blueprint",
  "xiaohongshu-white",
  "aurora"
];
const fxModuleIds = [
  "_util",
  "particle-burst",
  "confetti-cannon",
  "firework",
  "starfield",
  "matrix-rain",
  "knowledge-graph",
  "neural-net",
  "constellation",
  "orbit-ring",
  "galaxy-swirl",
  "word-cascade",
  "letter-explode",
  "chain-react",
  "magnetic-field",
  "data-stream",
  "gradient-blob",
  "sparkle-trail",
  "shockwave",
  "typewriter-multi",
  "counter-explosion"
];

const processPreamble = new RegExp([
  "I\\s+will\\s+(?:first|start|then|next)",
  "first\\s+I\\s+will",
  "next\\s+I\\s+will",
  "execution\\s+plan",
  "work\\s+plan",
  "plan\\s*[:\\-]",
  "\\u6211\\u4f1a",
  "\\u5148\\u505a",
  "\\u518d\\u505a",
  "\\u8ba1\\u5212\\u5982\\u4e0b",
  "\\u63a5\\u4e0b\\u6765",
  "\\u6b65\\u9aa4\\u5982\\u4e0b"
].join("|"), "i");
const processHeading = /^(?:plan|execution plan|work plan|next steps|workflow|\u8ba1\u5212|\u6267\u884c\u8ba1\u5212|\u5de5\u4f5c\u8ba1\u5212|\u6b65\u9aa4)[:\s-]*$/i;
const speakerNoteMarker = /(?:speaker(?:\s+notes?)?|presenter notes?|notes?|script|talk track|voiceover|narration|aside|\u5907\u6ce8|\u8bb2\u7a3f|\u65c1\u767d|\u6f14\u8bb2\u7a3f|\u63d0\u8bcd)\s*[:\uFF1A-]\s*/i;

export function buildDeckSpec(input: { title: string; blocks: CanvasBlock[] }): DeckSpec {
  const rawSlides = blocksToSlides(stripProcessPreamble(input.blocks));
  const deduped = dedupeSlides(rawSlides);
  const withoutHtml = {
    title: input.title || deduped.slides[0]?.title || "Deck",
    themeId: "minimal-white",
    format: "screen16x9" as const,
    slides: deduped.slides,
    validation: validateSlides(deduped.slides, deduped.warnings)
  };
  return { ...withoutHtml, html: renderDeckHtml(withoutHtml) };
}

export function deckProjectFiles(deck: DeckSpec, slidesMarkdown: string): Array<{ path: string; role: string; textContent: string }> {
  return [
    { path: "index.html", role: "entry", textContent: deck.html },
    { path: "slides.md", role: "source", textContent: slidesMarkdown },
    { path: "assets/runtime.js", role: "runtime", textContent: assetText("assets/runtime.js") },
    { path: "assets/base.css", role: "style", textContent: assetText("assets/base.css") },
    { path: "assets/fonts.css", role: "style", textContent: assetText("assets/fonts.css") },
    { path: "assets/animations/animations.css", role: "animation", textContent: assetText("assets/animations/animations.css") },
    { path: "assets/animations/fx-runtime.js", role: "runtime", textContent: assetText("assets/animations/fx-runtime.js") },
    ...fxModuleIds.map((id) => ({ path: `assets/animations/fx/${id}.js`, role: "runtime", textContent: assetText(`assets/animations/fx/${id}.js`) })),
    ...themeIds.map((id) => ({ path: `assets/themes/${id}.css`, role: "theme", textContent: assetText(`assets/themes/${id}.css`) }))
  ];
}

function stripProcessPreamble(blocks: CanvasBlock[]): CanvasBlock[] {
  const firstHeading = blocks.findIndex((block) => block.type === "heading");
  if (firstHeading <= 0) return blocks;
  const preamble = blocks.slice(0, firstHeading).map(blockText).join("\n");
  return processPreamble.test(preamble) ? blocks.slice(firstHeading) : blocks;
}

function blocksToSlides(blocks: CanvasBlock[]): DeckSlideSpec[] {
  const groups: CanvasBlock[][] = [];
  let current: CanvasBlock[] = [];

  for (const block of blocks) {
    if (block.type === "divider") {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    if (block.type === "heading" && current.length) {
      groups.push(current);
      current = [block];
      continue;
    }
    current.push(block);
  }

  if (current.length) groups.push(current);
  return groups
    .filter((group) => !isProcessGroup(group))
    .map((group, index) => slideFromBlocks(group, index))
    .filter((slide) => slide.visibleText.trim());
}

function slideFromBlocks(blocks: CanvasBlock[], index: number): DeckSlideSpec {
  const first = blocks[0];
  const title = first?.type === "heading" ? blockText(first) : `Slide ${index + 1}`;
  const rawBody = first?.type === "heading" ? blocks.slice(1) : blocks;
  const { body, notes } = extractSpeakerNotes(rawBody);
  const layoutId = pickLayout(title, body, index);
  const visibleText = [title, ...body.map(blockText)].join("\n").trim();
  const animation = index === 0 ? "fade-up" : "rise-in";

  return {
    id: createId("slide"),
    title,
    layoutId,
    html: renderSlideBody(title, body, layoutId, animation),
    notes: notes.length ? notes.join("\n\n") : generatedNotes(title, body),
    visibleText,
    animation
  };
}

function extractSpeakerNotes(blocks: CanvasBlock[]): { body: CanvasBlock[]; notes: string[] } {
  const body: CanvasBlock[] = [];
  const notes: string[] = [];

  for (const block of blocks) {
    const text = blockText(block);
    const match = text.match(speakerNoteMarker);
    if (!match || match.index === undefined) {
      body.push(block);
      continue;
    }
    const visible = text.slice(0, match.index).trim();
    const note = text.slice(match.index).replace(speakerNoteMarker, "").trim();
    if (visible) body.push({ ...block, text: visible, content: undefined });
    if (note) notes.push(note);
  }

  return { body, notes };
}

function isProcessGroup(group: CanvasBlock[]): boolean {
  const title = group[0]?.type === "heading" ? blockText(group[0]).trim() : "";
  const text = group.map(blockText).join("\n");
  return processHeading.test(title) || (processPreamble.test(text) && !hasAudienceContent(group));
}

function hasAudienceContent(group: CanvasBlock[]): boolean {
  return group.some((block) => block.type === "table" || block.type === "image" || block.type === "code" || block.type === "list");
}

function dedupeSlides(slides: DeckSlideSpec[]): { slides: DeckSlideSpec[]; warnings: string[] } {
  const seen = new Set<string>();
  const output: DeckSlideSpec[] = [];
  const warnings: string[] = [];

  for (const slide of slides) {
    const key = duplicateKey(slide);
    if (key && seen.has(key)) {
      warnings.push("duplicate-visible-slide-text");
      warnings.push("duplicate-visible-slide-removed");
      continue;
    }
    seen.add(key);
    output.push(slide);
  }

  return { slides: output, warnings };
}

function duplicateKey(slide: DeckSlideSpec): string {
  const lines = slide.visibleText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const body = lines.slice(1).join(" ");
  return normalizeText(body || lines.join(" "));
}

function pickLayout(title: string, body: CanvasBlock[], index: number): string {
  const text = [title, ...body.map(blockText)].join("\n");
  if (/compare|comparison|before|after|\bvs\b|versus|\u5bf9\u6bd4|\u6bd4\u8f83/i.test(text)) return "comparison";
  if (/timeline|roadmap|milestone|phase|quarter|\bQ[1-4]\b|\u65f6\u95f4|\u9636\u6bb5|\u8def\u7ebf/i.test(text)) return "timeline";
  if (/KPI|metric|revenue|retention|NPS|%|\$|\d{2,}/i.test(text)) return "kpi-grid";
  if (/process|step|workflow|how-to|\u6d41\u7a0b|\u673a\u5236|\u6b65\u9aa4/i.test(text)) return "process-steps";
  if (body.some((block) => block.type === "table")) return "table";
  if (/summary|takeaway|thanks|thank you|\u603b\u7ed3|\u7ed3\u8bba/i.test(text)) return "thanks";
  if (index === 0) return "cover";
  return body.some((block) => block.type === "list") ? "bullets" : "two-column";
}

function renderSlideBody(title: string, body: CanvasBlock[], layoutId: string, animation: string): string {
  if (layoutId === "cover") return renderCover(title, body, animation);
  if (layoutId === "comparison") return renderComparison(title, body);
  if (layoutId === "timeline") return renderTimeline(title, body);
  if (layoutId === "kpi-grid") return renderKpiGrid(title, body);
  if (layoutId === "process-steps") return renderProcessSteps(title, body);
  if (layoutId === "table") return renderTableSlide(title, body);
  if (layoutId === "thanks") return renderThanks(title, body);
  if (layoutId === "bullets") return renderBullets(title, body);
  return renderTwoColumn(title, body);
}

function renderCover(title: string, body: CanvasBlock[], animation: string): string {
  const lines = contentLines(body);
  return [
    '<p class="kicker">Canvas PPT</p>',
    `<h1 class="h1 anim-${animation}" data-anim="${animation}">${escapeHtml(title)}</h1>`,
    lines[0] ? `<p class="lede">${escapeHtml(lines[0])}</p>` : "",
    lines.length > 1 ? `<div class="row wrap mt-l">${lines.slice(1, 5).map((line) => `<span class="pill">${escapeHtml(line)}</span>`).join("")}</div>` : ""
  ].filter(Boolean).join("\n");
}

function renderComparison(title: string, body: CanvasBlock[]): string {
  const items = contentLines(body);
  const midpoint = Math.ceil(items.length / 2) || 1;
  const left = items.slice(0, midpoint);
  const right = items.slice(midpoint);
  return [
    '<p class="kicker">Comparison</p>',
    `<h2 class="h2">${escapeHtml(title)}</h2>`,
    '<div class="vs mt-l">',
    `<div class="card bad-side side anim-fade-left" data-anim="fade-left"><h3>${escapeHtml(left[0] ?? "Before")}</h3>${renderList(left.slice(1), "dim")}</div>`,
    '<div class="mid">→</div>',
    `<div class="card good-side side anim-fade-right" data-anim="fade-right"><h3>${escapeHtml(right[0] ?? "After")}</h3>${renderList(right.slice(1), "dim")}</div>`,
    "</div>"
  ].join("\n");
}

function renderTimeline(title: string, body: CanvasBlock[]): string {
  const items = contentLines(body).slice(0, 5);
  return [
    '<p class="kicker">Timeline</p>',
    `<h2 class="h2">${escapeHtml(title)}</h2>`,
    '<div class="tl"><div class="row anim-stagger-list" data-anim-target>',
    items.map((item, index) => {
      const parts = splitLabel(item);
      return `<div class="item"><div class="year">${escapeHtml(parts.label || `Phase ${index + 1}`)}</div><div class="dot"></div><h4>${escapeHtml(parts.title)}</h4><p>${escapeHtml(parts.detail)}</p></div>`;
    }).join(""),
    "</div></div>"
  ].join("\n");
}

function renderKpiGrid(title: string, body: CanvasBlock[]): string {
  const items = contentLines(body).slice(0, 4);
  return [
    '<p class="kicker">Metrics</p>',
    `<h2 class="h2">${escapeHtml(title)}</h2>`,
    '<div class="grid g4 mt-l anim-stagger-list" data-anim-target>',
    items.map((item) => {
      const metric = parseMetric(item);
      return `<div class="card"><p class="eyebrow">${escapeHtml(metric.label)}</p><div class="kpi-value"><span class="counter" data-to="${escapeHtml(metric.value)}">0</span>${escapeHtml(metric.suffix)}</div><p class="dim">${escapeHtml(metric.detail)}</p></div>`;
    }).join(""),
    "</div>"
  ].join("\n");
}

function renderProcessSteps(title: string, body: CanvasBlock[]): string {
  const items = contentLines(body).slice(0, 4);
  return [
    '<p class="kicker">Process</p>',
    `<h2 class="h2">${escapeHtml(title)}</h2>`,
    '<div class="steps mt-l anim-stagger-list" data-anim-target>',
    items.map((item, index) => {
      const parts = splitLabel(item);
      return `<div class="step"><div class="num">${index + 1}</div><h4>${escapeHtml(parts.title)}</h4><p>${escapeHtml(parts.detail || item)}</p><span class="tag">Step ${index + 1}</span></div>`;
    }).join(""),
    "</div>"
  ].join("\n");
}

function renderTableSlide(title: string, body: CanvasBlock[]): string {
  const table = body.find((block) => block.type === "table");
  const rows = tableRows(table);
  return [
    '<p class="kicker">Table</p>',
    `<h2 class="h2">${escapeHtml(title)}</h2>`,
    '<table class="canvas-table mt-l">',
    rows.map((row, index) => `<tr>${row.map((cell) => index === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join(""),
    "</table>"
  ].join("\n");
}

function renderThanks(title: string, body: CanvasBlock[]): string {
  const lines = contentLines(body);
  return [
    '<div class="center tc fill">',
    `<h1 class="h1" style="font-size:128px;line-height:1"><span class="gradient-text">${escapeHtml(title || "Thanks")}</span></h1>`,
    lines[0] ? `<p class="lede" style="margin:16px auto">${escapeHtml(lines[0])}</p>` : "",
    "</div>"
  ].filter(Boolean).join("\n");
}

function renderBullets(title: string, body: CanvasBlock[]): string {
  const items = contentLines(body).slice(0, 6);
  return [
    '<p class="kicker">Key Points</p>',
    `<h2 class="h2">${escapeHtml(title)}</h2>`,
    '<div class="grid g3 mt-l anim-stagger-list" data-anim-target>',
    items.map((item, index) => `<div class="card card-accent"><p class="eyebrow">${String(index + 1).padStart(2, "0")}</p><h4>${escapeHtml(item)}</h4></div>`).join(""),
    "</div>"
  ].join("\n");
}

function renderTwoColumn(title: string, body: CanvasBlock[]): string {
  const lines = contentLines(body);
  const midpoint = Math.ceil(lines.length / 2) || 1;
  return [
    '<p class="kicker">Insight</p>',
    `<h2 class="h2">${escapeHtml(title)}</h2>`,
    '<div class="grid g2 mt-l">',
    `<div class="card">${renderParagraphs(lines.slice(0, midpoint))}</div>`,
    `<div class="card card-soft">${renderParagraphs(lines.slice(midpoint))}</div>`,
    "</div>"
  ].join("\n");
}

function renderDeckHtml(spec: Omit<DeckSpec, "html">): string {
  const slides = spec.slides.map((slide, index) => [
    `<section class="${index === 0 ? "slide is-active" : "slide"}" data-title="${escapeHtml(slide.title)}" data-layout="${escapeHtml(slide.layoutId)}">`,
    slide.html,
    `<div class="deck-footer"><span>${escapeHtml(spec.title)}</span><span class="slide-number" data-current="${index + 1}" data-total="${spec.slides.length}"></span></div>`,
    `<aside class="notes">${escapeHtml(slide.notes ?? "")}</aside>`,
    "</section>"
  ].join("\n")).join("\n");

  return [
    "<!doctype html>",
    `<html lang="zh-CN" data-theme="${escapeHtml(spec.themeId)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(spec.title)}</title>`,
    '<link rel="stylesheet" href="assets/fonts.css">',
    '<link rel="stylesheet" href="assets/base.css">',
    `<link rel="stylesheet" id="theme-link" href="assets/themes/${escapeHtml(spec.themeId)}.css">`,
    '<link rel="stylesheet" href="assets/animations/animations.css">',
    `<style>${fallbackDeckCss()}${deckScopedCss()}</style>`,
    "</head>",
    `<body data-theme="${escapeHtml(spec.themeId)}" data-themes="${themeIds.map(escapeHtml).join(",")}" data-theme-base="assets/themes/">`,
    '<div class="deck">',
    slides,
    "</div>",
    '<script src="assets/runtime.js"></script>',
    '<script src="assets/animations/fx-runtime.js"></script>',
    "</body></html>"
  ].join("\n");
}

function validateSlides(slides: DeckSlideSpec[], warnings: string[] = []) {
  const seenBodies = new Set<string>();

  for (const slide of slides) {
    const bodyText = duplicateKey(slide);
    if (bodyText && seenBodies.has(bodyText)) warnings.push("duplicate-visible-slide-text");
    seenBodies.add(bodyText);
    if (processPreamble.test(slide.visibleText)) warnings.push("visible-process-text");
  }

  return { warnings: [...new Set(warnings)] };
}

function contentLines(blocks: CanvasBlock[]): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === "list" || block.type === "taskList") lines.push(...(block.content ?? []).map(blockText));
    else if (block.type === "table") lines.push(...tableRows(block).flat());
    else lines.push(...blockText(block).split(/\n+/));
  }
  return lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function renderList(items: string[], className: string): string {
  const fallback = items.length ? items : ["Clarify trade-off", "Show impact", "Name next move"];
  return `<ul class="${className}">${fallback.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderParagraphs(lines: string[]): string {
  const fallback = lines.length ? lines : ["Use this space for the key idea and supporting evidence."];
  return fallback.map((line) => `<p class="lede">${escapeHtml(line)}</p>`).join("");
}

function splitLabel(input: string): { label: string; title: string; detail: string } {
  const [left, ...rest] = input.split(/\s*[:：|-]\s*/);
  if (rest.length) return { label: left ?? "", title: left ?? input, detail: rest.join(" - ") };
  return { label: "", title: input, detail: "" };
}

function parseMetric(input: string): { label: string; value: string; suffix: string; detail: string } {
  const match = input.match(/(-?\d+(?:\.\d+)?)([%KMBkmb]*)/);
  if (!match) return { label: input, value: "1", suffix: "", detail: "Qualitative signal" };
  const value = match[1] ?? "0";
  const suffix = match[2] ?? "";
  const label = input.slice(0, match.index).replace(/[:：|-]\s*$/, "").trim() || "Metric";
  const detail = input.slice((match.index ?? 0) + match[0].length).replace(/^[:：|-]\s*/, "").trim() || input;
  return { label, value, suffix, detail };
}

function tableRows(block: CanvasBlock | undefined): string[][] {
  const rows = Array.isArray(block?.attrs?.rows) ? block?.attrs?.rows : [];
  const parsed = rows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map(String));
  return parsed.length ? parsed : [["Item", "Detail"], ["Key point", "Evidence"]];
}

function generatedNotes(title: string, body: CanvasBlock[]): string {
  const lines = contentLines(body).slice(0, 3);
  const detail = lines.length ? `Touch on: ${lines.join("; ")}.` : "Add the short context that helps the audience understand the slide.";
  return `Speaker note for "${title}": ${detail} Keep process planning out of the visible slide.`;
}

function skillRoot() {
  return process.env.HTML_PPT_SKILL_ROOT || defaultSkillRoot;
}

function assetText(relativePath: string): string {
  const file = path.join(skillRoot(), relativePath);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function fallbackDeckCss(): string {
  return [
    "html,body{margin:0;width:100%;height:100%;overflow:hidden}",
    ".deck{position:relative;width:100%;height:100%;overflow:hidden;background:var(--bg,#fff)}",
    ".slide{position:absolute;inset:0;opacity:0;pointer-events:none;padding:72px 96px;box-sizing:border-box}",
    ".slide.is-active{opacity:1;pointer-events:auto}",
    ".notes{display:none!important}",
    ".h1{font-size:72px}.h2{font-size:48px}.lede{font-size:24px;line-height:1.42}",
    ".grid{display:grid;gap:24px}.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}",
    ".card{background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.1));border-radius:var(--radius,18px);padding:26px;box-shadow:var(--shadow,none)}"
  ].join("");
}

function deckScopedCss(): string {
  return [
    ".kpi-value{font-size:52px;font-weight:800;line-height:1.05;margin:10px 0;color:var(--text-1)}",
    ".vs{display:grid;grid-template-columns:1fr 90px 1fr;gap:28px;align-items:stretch;margin-top:30px}.vs .side{padding:30px}.vs .mid{font-size:56px;font-weight:800;color:var(--text-3);display:flex;align-items:center;justify-content:center}.bad-side{border-top:3px solid var(--bad)}.good-side{border-top:3px solid var(--good)}",
    ".steps{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}.step{position:relative;padding:28px 26px 24px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow)}.step .num{position:absolute;top:-22px;left:22px;width:44px;height:44px;border-radius:50%;background:var(--accent);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800}.step h4{margin:18px 0 8px}.step p{font-size:14px;color:var(--text-2)}.step .tag{display:inline-block;margin-top:10px;font-size:11px;padding:3px 10px;border-radius:999px;background:var(--surface-2);color:var(--text-3)}",
    ".tl{position:relative;margin-top:40px}.tl::before{content:\"\";position:absolute;left:0;right:0;top:48px;height:2px;background:var(--border)}.tl .row{display:grid;grid-template-columns:repeat(5,1fr);gap:22px;align-items:start}.tl .item{position:relative;padding-top:80px;text-align:center}.tl .dot{position:absolute;top:36px;left:50%;transform:translateX(-50%);width:24px;height:24px;border-radius:50%;background:var(--accent);border:4px solid var(--bg);box-shadow:0 0 0 2px var(--accent)}.tl .year{font-size:14px;color:var(--text-3);letter-spacing:.12em;text-transform:uppercase;position:absolute;top:0;left:0;right:0;font-weight:600}.tl h4{font-size:18px}.tl p{font-size:13px;color:var(--text-2)}",
    ".canvas-table{width:100%;border-collapse:collapse;background:var(--surface);box-shadow:var(--shadow);border-radius:var(--radius);overflow:hidden}.canvas-table th,.canvas-table td{padding:16px 18px;border-bottom:1px solid var(--border);text-align:left}.canvas-table th{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--text-3);background:var(--surface-2)}"
  ].join("");
}

function blockText(block: CanvasBlock): string {
  if (block.type === "table") return tableRows(block).map((row) => row.join(" | ")).join("\n");
  return block.text ?? block.content?.map(blockText).join("\n") ?? "";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
}

namespace __core_canvas_canvasText {
const sanitizeHtml = __default_1;
import CanvasBlock = __ext_1.CanvasBlock;
import CanvasContent = __ext_1.CanvasContent;
import CanvasKind = __ext_1.CanvasKind;
import createId = __core_utils_id.createId;
import truncate = __core_utils_id.truncate;
import buildDeckSpec = __core_canvas_canvasDeck.buildDeckSpec;
const codeFence = /^```([A-Za-z0-9_+-]*)\s*$/;
const tableLine = /^\|.+\|$/;

export function emptyCanvasContent(): CanvasContent {
  return { format: "block_ast_v1", blocks: [] };
}

export function canvasSummary(text: string) {
  return truncate(text.replace(/\s+/g, " ").trim(), 180);
}

export function inferCanvasKind(input: string): CanvasKind {
  if (/\b(ppt|slides?|deck)\b|幻灯片|演示文稿/i.test(input)) return "ppt";
  if (/mermaid|流程图|flowchart|sequenceDiagram|graph\s+(TD|LR)/i.test(input)) return "diagram";
  if (/vega|图表|chart|柱状图|折线图|饼图|可视化/i.test(input)) return "chart";
  if (/<html|<!doctype|React|组件|页面|网页|app|demo/i.test(input)) return "app";
  if (/```|代码|function|class|interface|const\s+\w+|def\s+\w+/i.test(input)) return "code";
  return "document";
}

export function textToCanvasContent(text: string, kind: CanvasKind = inferCanvasKind(text)): CanvasContent {
  const blocks = kind === "code" || kind === "app" ? codeBlocks(text, kind) : documentBlocks(text);
  const normalizedBlocks = blocks.length ? blocks : [paragraph(text)];
  return {
    format: "block_ast_v1",
    blocks: normalizedBlocks,
    ...(kind === "ppt" ? { deck: buildDeckSpec({ title: firstHeading(normalizedBlocks) ?? "Deck", blocks: normalizedBlocks }) } : {})
  };
}

export function canvasContentToText(content: CanvasContent): string {
  return content.blocks.map(blockText).filter(Boolean).join("\n\n");
}

export function canvasContentToMarkdown(content: CanvasContent): string {
  return content.blocks.map(markdownBlock).filter(Boolean).join("\n\n");
}

export function canvasContentToHtml(content: CanvasContent): string {
  const body = content.blocks.map(htmlBlock).join("\n");
  return sanitizeHtml(`<!doctype html><html><body>${body}</body></html>`, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "section", "main", "article", "pre", "code"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height"],
      code: ["class"],
      "*": ["class", "style", "aria-label"]
    },
    allowedSchemes: ["http", "https", "data"],
    disallowedTagsMode: "discard"
  });
}

export function autoLayoutContent(content: CanvasContent): CanvasContent {
  const text = canvasContentToText(content);
  const laidOut = textToCanvasContent(text);
  return {
    format: "block_ast_v1",
    blocks: laidOut.blocks.map((block, index) =>
      index === 0 && block.type === "paragraph" && block.text && block.text.length < 80
        ? { ...block, type: "heading", attrs: { level: 1 } }
        : block
    )
  };
}

function documentBlocks(input: string): CanvasBlock[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: CanvasBlock[] = [];
  let paragraphLines: string[] = [];
  let fence: { lang: string; lines: string[] } | undefined;
  const flushParagraph = () => {
    const value = paragraphLines.join(" ").trim();
    if (value) blocks.push(paragraph(value));
    paragraphLines = [];
  };
  for (const line of lines) {
    const fenceMatch = line.match(codeFence);
    if (fence) {
      if (fenceMatch) {
        blocks.push(codeLikeBlock(fence.lang, fence.lines.join("\n")));
        fence = undefined;
      } else fence.lines.push(line);
      continue;
    }
    if (fenceMatch) {
      flushParagraph();
      fence = { lang: fenceMatch[1] ?? "", lines: [] };
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    if (tableLine.test(line)) {
      flushParagraph();
      blocks.push(tableBlock(line));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ id: createId("blk"), type: "heading", text: heading[2] ?? "", attrs: { level: (heading[1] ?? "#").length } });
      continue;
    }
    const list = line.match(/^[-*+]\s+(.+)$/);
    if (list) {
      flushParagraph();
      blocks.push({ id: createId("blk"), type: "list", content: [paragraph(list[1] ?? "")] });
      continue;
    }
    paragraphLines.push(line.trim());
  }
  flushParagraph();
  if (fence) blocks.push(codeLikeBlock(fence.lang, fence.lines.join("\n")));
  return mergeAdjacentLists(blocks);
}

function codeBlocks(input: string, kind: CanvasKind): CanvasBlock[] {
  const files: { path: string; language: string; content: string }[] = [];
  let plain = "";
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  let fence: { lang: string; lines: string[] } | undefined;
  for (const line of lines) {
    const match = line.match(codeFence);
    if (fence) {
      if (match) {
        const language = fence.lang || "text";
        files.push({ path: `/main.${extension(language)}`, language, content: fence.lines.join("\n") });
        fence = undefined;
      } else fence.lines.push(line);
      continue;
    }
    if (match) fence = { lang: match[1] ?? "", lines: [] };
    else plain += `${line}\n`;
  }
  if (fence) files.push({ path: `/main.${extension(fence.lang)}`, language: fence.lang || "text", content: fence.lines.join("\n") });
  if (!files.length) files.push({ path: kind === "app" ? "/index.html" : "/main.txt", language: kind === "app" ? "html" : "text", content: input });
  return [{ id: createId("blk"), type: kind === "app" ? "codeProject" : "code", text: plain.trim(), attrs: { files, entry: files[0]?.path } }];
}

function codeLikeBlock(language: string, code: string): CanvasBlock {
  const lang = language.toLowerCase();
  if (lang === "mermaid") return { id: createId("blk"), type: "mermaid", text: code };
  if (lang === "vega" || lang === "vega-lite" || lang === "vegalite") return { id: createId("blk"), type: "vegaLite", text: code };
  if (lang === "math" || lang === "latex") return { id: createId("blk"), type: "math", text: code };
  if (lang === "html") return { id: createId("blk"), type: "embedHtml", text: code };
  return { id: createId("blk"), type: "code", text: code, attrs: { language: language || "text" } };
}

function paragraph(text: string): CanvasBlock {
  return { id: createId("blk"), type: "paragraph", text };
}

function tableBlock(line: string): CanvasBlock {
  const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
  return { id: createId("blk"), type: "table", attrs: { rows: [cells] } };
}

function mergeAdjacentLists(blocks: CanvasBlock[]): CanvasBlock[] {
  const output: CanvasBlock[] = [];
  for (const block of blocks) {
    const last = output.at(-1);
    if (last?.type === "list" && block.type === "list") last.content = [...(last.content ?? []), ...(block.content ?? [])];
    else output.push(block);
  }
  return output;
}

function blockText(block: CanvasBlock): string {
  if (block.text) return block.text;
  return (block.content ?? []).map(blockText).join("\n");
}

function markdownBlock(block: CanvasBlock): string {
  if (block.type === "heading") return `${"#".repeat(Number(block.attrs?.level ?? 2))} ${block.text ?? ""}`;
  if (block.type === "list") return (block.content ?? []).map((item) => `- ${blockText(item)}`).join("\n");
  if (block.type === "code") return `\`\`\`${String(block.attrs?.language ?? "")}\n${block.text ?? ""}\n\`\`\``;
  if (block.type === "math") return `$$\n${block.text ?? ""}\n$$`;
  if (block.type === "mermaid") return `\`\`\`mermaid\n${block.text ?? ""}\n\`\`\``;
  if (block.type === "vegaLite") return `\`\`\`vega-lite\n${block.text ?? ""}\n\`\`\``;
  return blockText(block);
}

function htmlBlock(block: CanvasBlock): string {
  const text = escapeHtml(block.text ?? blockText(block));
  if (block.type === "heading") return `<h${Number(block.attrs?.level ?? 2)}>${text}</h${Number(block.attrs?.level ?? 2)}>`;
  if (block.type === "list") return `<ul>${(block.content ?? []).map((item) => `<li>${escapeHtml(blockText(item))}</li>`).join("")}</ul>`;
  if (block.type === "code") return `<pre><code>${text}</code></pre>`;
  if (block.type === "embedHtml") return sanitizeHtml(block.text ?? "");
  if (block.type === "divider") return "<hr>";
  return `<p>${text}</p>`;
}

function extension(language: string) {
  return ({ javascript: "js", typescript: "ts", python: "py", html: "html", css: "css", json: "json" } as Record<string, string>)[language.toLowerCase()] ?? "txt";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function firstHeading(blocks: CanvasBlock[]): string | undefined {
  return blocks.find((block) => block.type === "heading" && block.text)?.text;
}
}

namespace __core_storage_sqliteSchema {
import DatabaseSync = __ext_6.DatabaseSync;
type WorkbenchSqliteDatabase = Pick<DatabaseSync, "exec" | "prepare">;

export function initializeWorkbenchDatabase(db: WorkbenchSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
      content TEXT,
      reasoning_content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('document','code','app','diagram','chart','ppt')),
      status TEXT NOT NULL CHECK (status IN ('streaming','ready','failed')),
      title TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '',
      summary TEXT,
      source_message_id TEXT,
      task_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_canvases_conversation ON canvases(conversation_id, updated_at);

    CREATE TABLE IF NOT EXISTS canvas_projects (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('document','prototype','deck','app','diagram','chart','image','image_set','video','tool','data')),
      engine TEXT NOT NULL CHECK (engine IN ('document','prototype','deck','image','video','tool','legacy_artifact')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','failed')),
      title TEXT NOT NULL DEFAULT '',
      current_version_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_projects_conversation ON canvas_projects(conversation_id, updated_at);

    CREATE TABLE IF NOT EXISTS asset_blobs (
      hash TEXT PRIMARY KEY CHECK (length(hash) = 64),
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      bytes INTEGER NOT NULL DEFAULT 0,
      storage_uri TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS canvas_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES canvas_nodes(id) ON DELETE CASCADE,
      node_type TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      content_json TEXT NOT NULL DEFAULT '{}',
      text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_nodes_project ON canvas_nodes(project_id, parent_id, order_index);

    CREATE TABLE IF NOT EXISTS canvas_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'source',
      content_hash TEXT REFERENCES asset_blobs(hash) ON DELETE SET NULL,
      text_content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, path)
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_files_project ON canvas_files(project_id, path);

    CREATE TABLE IF NOT EXISTS canvas_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, version_number)
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_versions_project ON canvas_versions(project_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS canvas_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      asset_hash TEXT NOT NULL REFERENCES asset_blobs(hash) ON DELETE RESTRICT,
      role TEXT NOT NULL DEFAULT 'asset',
      name TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_assets_project ON canvas_assets(project_id, role);

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES canvas_versions(id) ON DELETE SET NULL,
      engine TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
      input_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_render_jobs_project ON render_jobs(project_id, updated_at);

    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES canvas_versions(id) ON DELETE SET NULL,
      format TEXT NOT NULL CHECK (format IN ('markdown','html','pdf','png','docx','pptx','mp4','webm','zip','json')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
      options_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_export_jobs_project ON export_jobs(project_id, updated_at);

    CREATE TABLE IF NOT EXISTS canvas_outputs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      job_id TEXT,
      output_type TEXT NOT NULL,
      asset_hash TEXT REFERENCES asset_blobs(hash) ON DELETE SET NULL,
      storage_uri TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_outputs_project ON canvas_outputs(project_id, created_at);

    CREATE TABLE IF NOT EXISTS review_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES canvas_versions(id) ON DELETE SET NULL,
      scope TEXT NOT NULL,
      score_json TEXT NOT NULL DEFAULT '{}',
      findings_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_review_reports_project ON review_reports(project_id, created_at);

    CREATE TABLE IF NOT EXISTS methodology_states (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      project_id TEXT REFERENCES canvas_projects(id) ON DELETE CASCADE,
      workflow_type TEXT NOT NULL DEFAULT '',
      phase TEXT NOT NULL DEFAULT '',
      primary_focus TEXT NOT NULL DEFAULT '',
      state_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(conversation_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_methodology_states_project ON methodology_states(project_id, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_methodology_states_project_unique ON methodology_states(project_id) WHERE project_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_methodology_states_conversation_unique ON methodology_states(conversation_id) WHERE project_id IS NULL AND conversation_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS evidence_items (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      project_id TEXT,
      source_type TEXT NOT NULL,
      claim TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      citation TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_items_project ON evidence_items(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_evidence_items_conversation ON evidence_items(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS contradiction_items (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      project_id TEXT,
      subject_a TEXT NOT NULL,
      subject_b TEXT NOT NULL,
      nature TEXT NOT NULL,
      rank TEXT NOT NULL,
      dominant_side TEXT NOT NULL,
      risk TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_contradiction_items_project ON contradiction_items(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_contradiction_items_conversation ON contradiction_items(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS focus_locks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      project_id TEXT,
      target TEXT NOT NULL,
      done_signal TEXT NOT NULL DEFAULT '',
      paused_items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(conversation_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_focus_locks_project ON focus_locks(project_id, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_locks_project_unique ON focus_locks(project_id) WHERE project_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_locks_conversation_unique ON focus_locks(conversation_id) WHERE project_id IS NULL AND conversation_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS validation_cycles (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      project_id TEXT,
      hypothesis TEXT NOT NULL,
      action TEXT NOT NULL,
      expected TEXT NOT NULL DEFAULT '',
      actual TEXT NOT NULL DEFAULT '',
      learning TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_validation_cycles_project ON validation_cycles(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_validation_cycles_conversation ON validation_cycles(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS feedback_syntheses (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      project_id TEXT,
      sources_json TEXT NOT NULL DEFAULT '[]',
      agreements_json TEXT NOT NULL DEFAULT '[]',
      conflicts_json TEXT NOT NULL DEFAULT '[]',
      gaps_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_syntheses_project ON feedback_syntheses(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_syntheses_conversation ON feedback_syntheses(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      workflow_type TEXT NOT NULL CHECK (workflow_type IN ('new_project','troubleshooting','iteration')),
      phase TEXT NOT NULL DEFAULT 'explore' CHECK (phase IN ('explore','focus','expand')),
      primary_goal TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','done','cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_plans_conversation ON plans(conversation_id, updated_at);

    CREATE TABLE IF NOT EXISTS plan_steps (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
      result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_plan_steps_plan ON plan_steps(plan_id, step_order);

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('chat','plan','canvas')),
      source_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cards_type_archived ON cards(type, archived);
  `);
  migrateCanvasesKindConstraint(db);
}

function migrateCanvasesKindConstraint(db: WorkbenchSqliteDatabase): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'canvases'")
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes("'ppt'")) return;
  db.exec(`
    DROP INDEX IF EXISTS idx_canvases_conversation;
    ALTER TABLE canvases RENAME TO canvases_without_ppt;
    CREATE TABLE canvases (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('document','code','app','diagram','chart','ppt')),
      status TEXT NOT NULL CHECK (status IN ('streaming','ready','failed')),
      title TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '',
      summary TEXT,
      source_message_id TEXT,
      task_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO canvases (
      id, conversation_id, kind, status, title, content_json, content_text, summary,
      source_message_id, task_id, version, metadata, created_at, updated_at
    )
    SELECT
      id, conversation_id, kind, status, title, content_json, content_text, summary,
      source_message_id, task_id, version, metadata, created_at, updated_at
    FROM canvases_without_ppt;
    DROP TABLE canvases_without_ppt;
    CREATE INDEX IF NOT EXISTS idx_canvases_conversation ON canvases(conversation_id, updated_at);
  `);
}
}

namespace __core_storage_sqliteRows {
import Canvas = __ext_1.Canvas;
import Card = __ext_1.Card;
import ChatMessage = __ext_1.ChatMessage;
import Conversation = __ext_1.Conversation;
import Plan = __ext_1.Plan;
import PlanStep = __ext_1.PlanStep;
import WorkflowType = __ext_1.WorkflowType;
export type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: ChatMessage["role"];
  content: string | null;
  reasoning_content: string | null;
  tool_calls: string | null;
  tool_call_id: string | null;
  created_at: string;
};

export type CanvasRow = {
  id: string;
  conversation_id: string | null;
  kind: Canvas["kind"];
  status: Canvas["status"];
  title: string;
  content_json: string;
  content_text: string;
  summary: string | null;
  source_message_id: string | null;
  task_id: string | null;
  version: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanRow = {
  id: string;
  conversation_id: string | null;
  workflow_type: WorkflowType;
  phase: Plan["phase"];
  primary_goal: string;
  content: string;
  status: Plan["status"];
  created_at: string;
  updated_at: string;
};

export type PlanStepRow = {
  id: string;
  plan_id: string;
  step_order: number;
  title: string;
  status: PlanStep["status"];
  result: string | null;
  created_at: string;
  updated_at: string;
};

export type CardRow = {
  id: string;
  type: Card["type"];
  source_id: string;
  title: string;
  summary: string;
  archived: number;
  created_at: string;
  updated_at: string;
};
}

namespace __core_storage_sqliteDatabase {
import existsSync = __ext_5.existsSync;
import mkdirSync = __ext_5.mkdirSync;
import homedir = __ext_7.homedir;
import dirname = __ext_8.dirname;
import join = __ext_8.join;
import DatabaseSync = __ext_6.DatabaseSync;
import Canvas = __ext_1.Canvas;
import ChatMessage = __ext_1.ChatMessage;
import Conversation = __ext_1.Conversation;
import CreateCanvasRequest = __ext_1.CreateCanvasRequest;
import CreateConversationRequest = __ext_1.CreateConversationRequest;
import Card = __ext_1.Card;
import CardListFilter = __ext_1.CardListFilter;
import Plan = __ext_1.Plan;
import PlanStep = __ext_1.PlanStep;
import UpdateCanvasRequest = __ext_1.UpdateCanvasRequest;
import UpdateConversationRequest = __ext_1.UpdateConversationRequest;
import WorkflowType = __ext_1.WorkflowType;
import canvasContentToText = __core_canvas_canvasText.canvasContentToText;
import canvasSummary = __core_canvas_canvasText.canvasSummary;
import emptyCanvasContent = __core_canvas_canvasText.emptyCanvasContent;
import textToCanvasContent = __core_canvas_canvasText.textToCanvasContent;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import initializeWorkbenchDatabase = __core_storage_sqliteSchema.initializeWorkbenchDatabase;
import CanvasRow = __core_storage_sqliteRows.CanvasRow;
import CardRow = __core_storage_sqliteRows.CardRow;
import ConversationRow = __core_storage_sqliteRows.ConversationRow;
import MessageRow = __core_storage_sqliteRows.MessageRow;
import PlanRow = __core_storage_sqliteRows.PlanRow;
import PlanStepRow = __core_storage_sqliteRows.PlanStepRow;
type DatabaseInstance = DatabaseSync;
const pinocchioDataDir = ".pinocchio";
const legacyDeepSeekDataDir = ".deepseek-workbench";

interface DbPathResolveOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
}

export interface ConversationDraft {
  id?: string | undefined;
  title?: string | undefined;
}

export interface PlanDraft {
  conversationId?: string | null | undefined;
  workflowType?: WorkflowType | undefined;
  phase?: Plan["phase"] | undefined;
  primaryGoal: string;
  content: string;
  status?: Plan["status"] | undefined;
}

export class WorkbenchDatabase {
  private readonly db: DatabaseInstance;

  constructor(private readonly dbPath = resolveDbPath()) {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA busy_timeout = 5000");
    initializeWorkbenchDatabase(this.db);
  }

  listConversations(): Conversation[] {
    const rows = this.db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC, created_at DESC").all() as ConversationRow[];
    return rows.map((row) => this.toConversation(row));
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
    return row ? this.toConversation(row) : undefined;
  }

  createConversation(input: CreateConversationRequest = {}): Conversation {
    const now = nowIso();
    const id = (input as ConversationDraft).id ?? createId("conv");
    const title = input.title?.trim() || "New conversation";
    this.db
      .prepare("INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, title, now, now);
    return this.getConversation(id)!;
  }

  updateConversation(id: string, input: UpdateConversationRequest): Conversation {
    const current = this.getConversation(id);
    if (!current) throw new Error("Conversation not found");
    const updatedAt = nowIso();
    const title = input.title?.trim() || current.title;
    this.db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(title, updatedAt, id);
    return this.getConversation(id)!;
  }

  deleteConversation(id: string): void {
    this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  }

  appendMessages(conversationId: string, messages: ChatMessage[]): Conversation {
    if (!messages.length) return this.getConversation(conversationId) ?? this.createConversation();
    const insert = this.db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, reasoning_content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const update = this.db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?");
    this.db.exec("BEGIN");
    try {
      const now = nowIso();
      for (const message of messages) {
        insert.run(
          message.id,
          conversationId,
          message.role,
          message.content ?? null,
          message.reasoning_content ?? null,
          message.tool_calls ? JSON.stringify(message.tool_calls) : null,
          message.tool_call_id ?? null,
          message.createdAt
        );
      }
      update.run(now, conversationId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getConversation(conversationId)!;
  }

  listMessages(conversationId: string): ChatMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC")
      .all(conversationId) as MessageRow[];
    return rows.map((row) => this.toMessage(row));
  }

  listCanvases(conversationId?: string | null): Canvas[] {
    const rows = conversationId === undefined
      ? (this.db.prepare("SELECT * FROM canvases ORDER BY updated_at DESC, created_at DESC").all() as CanvasRow[])
      : (this.db.prepare("SELECT * FROM canvases WHERE conversation_id IS ? ORDER BY updated_at DESC, created_at DESC").all(conversationId) as CanvasRow[]);
    return rows.map((row) => this.toCanvas(row));
  }

  getCanvas(id: string): Canvas | undefined {
    const row = this.db.prepare("SELECT * FROM canvases WHERE id = ?").get(id) as CanvasRow | undefined;
    return row ? this.toCanvas(row) : undefined;
  }

  createCanvas(input: CreateCanvasRequest): Canvas {
    const now = nowIso();
    const id = createId("can");
    const contentJson = input.contentJson ?? (input.contentText ? textToCanvasContent(input.contentText, input.kind) : emptyCanvasContent());
    const contentText = input.contentText ?? canvasContentToText(contentJson);
    const title = input.title.trim();
    this.db
      .prepare(
        "INSERT INTO canvases (id, conversation_id, kind, status, title, content_json, content_text, summary, source_message_id, task_id, version, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.conversationId ?? null,
        input.kind,
        input.status ?? "ready",
        title,
        JSON.stringify(contentJson),
        contentText,
        canvasSummary(contentText),
        input.sourceMessageId ?? null,
        input.taskId ?? null,
        1,
        JSON.stringify(input.metadata ?? {}),
        now,
        now
      );
    return this.getCanvas(id)!;
  }

  updateCanvas(id: string, input: UpdateCanvasRequest): Canvas {
    const current = this.getCanvas(id);
    if (!current) throw new Error("Canvas not found");
    const contentJson = input.contentJson ?? (input.contentText ? textToCanvasContent(input.contentText, current.kind) : current.contentJson);
    const contentText = input.contentText ?? (input.contentJson ? canvasContentToText(contentJson) : current.contentText);
    const summary = input.summary ?? canvasSummary(contentText);
    const metadata = { ...(current.metadata ?? {}), ...(input.metadata ?? {}) };
    const now = nowIso();
    this.db
      .prepare(
        "UPDATE canvases SET title = ?, status = ?, content_json = ?, content_text = ?, summary = ?, metadata = ?, version = ?, updated_at = ? WHERE id = ?"
      )
      .run(
        input.title?.trim() || current.title,
        input.status ?? current.status,
        JSON.stringify(contentJson),
        contentText,
        summary,
        JSON.stringify(metadata),
        current.version + 1,
        now,
        id
      );
    return this.getCanvas(id)!;
  }

  deleteCanvas(id: string): void {
    this.db.prepare("DELETE FROM canvases WHERE id = ?").run(id);
  }

  listPlans(conversationId?: string | null): Plan[] {
    const rows = conversationId === undefined
      ? (this.db.prepare("SELECT * FROM plans ORDER BY updated_at DESC, created_at DESC").all() as PlanRow[])
      : (this.db.prepare("SELECT * FROM plans WHERE conversation_id IS ? ORDER BY updated_at DESC, created_at DESC").all(conversationId) as PlanRow[]);
    return rows.map((row) => this.toPlan(row));
  }

  getPlan(id: string): Plan | undefined {
    const row = this.db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as PlanRow | undefined;
    return row ? this.toPlan(row) : undefined;
  }

  createPlan(input: PlanDraft): Plan {
    const id = createId("plan");
    const now = nowIso();
    this.db
      .prepare(
        "INSERT INTO plans (id, conversation_id, workflow_type, phase, primary_goal, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.conversationId ?? null,
        input.workflowType ?? "new_project",
        input.phase ?? "explore",
        input.primaryGoal.trim(),
        input.content,
        input.status ?? "draft",
        now,
        now
      );
    return this.getPlan(id)!;
  }

  updatePlan(id: string, patch: Partial<PlanDraft>): Plan {
    const current = this.getPlan(id);
    if (!current) throw new Error("Plan not found");
    const updated: PlanRow = {
      id,
      conversation_id: patch.conversationId ?? current.conversationId,
      workflow_type: patch.workflowType ?? current.workflowType,
      phase: patch.phase ?? current.phase,
      primary_goal: patch.primaryGoal?.trim() || current.primaryGoal,
      content: patch.content ?? current.content,
      status: patch.status ?? current.status,
      created_at: current.createdAt,
      updated_at: nowIso()
    };
    this.db
      .prepare(
        "UPDATE plans SET conversation_id = ?, workflow_type = ?, phase = ?, primary_goal = ?, content = ?, status = ?, updated_at = ? WHERE id = ?"
      )
      .run(
        updated.conversation_id,
        updated.workflow_type,
        updated.phase,
        updated.primary_goal,
        updated.content,
        updated.status,
        updated.updated_at,
        id
      );
    return this.getPlan(id)!;
  }

  deletePlan(id: string): void {
    this.db.prepare("DELETE FROM plans WHERE id = ?").run(id);
  }

  listPlanSteps(planId: string): PlanStep[] {
    const rows = this.db
      .prepare("SELECT * FROM plan_steps WHERE plan_id = ? ORDER BY step_order ASC, created_at ASC")
      .all(planId) as PlanStepRow[];
    return rows.map((row) => this.toPlanStep(row));
  }

  replacePlanSteps(planId: string, steps: Omit<PlanStep, "planId">[]): PlanStep[] {
    const now = nowIso();
    const insert = this.db.prepare(
      "INSERT INTO plan_steps (id, plan_id, step_order, title, status, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM plan_steps WHERE plan_id = ?").run(planId);
      for (const step of steps) {
        insert.run(step.id, planId, step.stepOrder, step.title, step.status, step.result ?? null, step.createdAt, step.updatedAt || now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.listPlanSteps(planId);
  }

  updatePlanStep(id: string, patch: Partial<Omit<PlanStep, "id" | "planId" | "createdAt">>): PlanStep {
    const current = this.db.prepare("SELECT * FROM plan_steps WHERE id = ?").get(id) as PlanStepRow | undefined;
    if (!current) throw new Error("Plan step not found");
    const updated: PlanStepRow = {
      ...current,
      step_order: patch.stepOrder ?? current.step_order,
      title: patch.title?.trim() || current.title,
      status: patch.status ?? current.status,
      result: patch.result ?? current.result,
      updated_at: nowIso()
    };
    this.db
      .prepare("UPDATE plan_steps SET step_order = ?, title = ?, status = ?, result = ?, updated_at = ? WHERE id = ?")
      .run(updated.step_order, updated.title, updated.status, updated.result, updated.updated_at, id);
    return this.toPlanStep(updated);
  }

  listCards(filter: CardListFilter = {}): Card[] {
    const clauses: string[] = [];
    const params: Array<string | number | null> = [];
    if (filter.type) {
      clauses.push("type = ?");
      params.push(filter.type);
    }
    if (typeof filter.archived === "boolean") {
      clauses.push("archived = ?");
      params.push(filter.archived ? 1 : 0);
    }
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim().toLowerCase()}%`;
      clauses.push("(LOWER(title) LIKE ? OR LOWER(summary) LIKE ?)");
      params.push(term, term);
    }
    if (filter.conversationId) {
      clauses.push("((type = 'chat' AND source_id = ?) OR (type = 'plan' AND source_id IN (SELECT id FROM plans WHERE conversation_id IS ?)) OR (type = 'canvas' AND source_id IN (SELECT id FROM canvases WHERE conversation_id IS ?)))");
      params.push(filter.conversationId, filter.conversationId, filter.conversationId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM cards ${where} ORDER BY updated_at DESC, created_at DESC`)
      .all(...params) as CardRow[];
    return rows.map((row) => this.toCard(row));
  }

  upsertCard(card: Card): Card {
    const existing = this.db.prepare("SELECT archived, created_at FROM cards WHERE id = ?").get(card.id) as Pick<CardRow, "archived" | "created_at"> | undefined;
    const createdAt: string = existing?.created_at ?? card.createdAt;
    const archived: number = existing ? Number(existing.archived) : (card.archived ? 1 : 0);
    this.db
      .prepare(
        "INSERT INTO cards (id, type, source_id, title, summary, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type = excluded.type, source_id = excluded.source_id, title = excluded.title, summary = excluded.summary, archived = COALESCE(cards.archived, excluded.archived), updated_at = excluded.updated_at"
      )
      .run(card.id, card.type, card.sourceId, card.title.trim(), card.summary.trim(), archived, createdAt, card.updatedAt);
    return this.getCard(card.id)!;
  }

  getCard(id: string): Card | undefined {
    const row = this.db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as CardRow | undefined;
    return row ? this.toCard(row) : undefined;
  }

  setCardArchived(id: string, archived: boolean): Card {
    const card = this.getCard(id);
    if (!card) throw new Error("Card not found");
    this.db.prepare("UPDATE cards SET archived = ?, updated_at = ? WHERE id = ?").run(archived ? 1 : 0, nowIso(), id);
    return this.getCard(id)!;
  }

  deleteCard(id: string): void {
    this.db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): ReturnType<DatabaseInstance["prepare"]> {
    return this.db.prepare(sql);
  }

  private toConversation(row: ConversationRow): Conversation {
    return {
      id: row.id,
      title: row.title,
      messages: this.listMessages(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private toMessage(row: MessageRow): ChatMessage {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      reasoning_content: row.reasoning_content ?? undefined,
      tool_calls: row.tool_calls ? (JSON.parse(row.tool_calls) as ChatMessage["tool_calls"]) : undefined,
      tool_call_id: row.tool_call_id ?? undefined,
      createdAt: row.created_at
    };
  }

  private toCanvas(row: CanvasRow): Canvas {
    const contentJson = JSON.parse(row.content_json) as Canvas["contentJson"];
    const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      title: row.title,
      kind: row.kind,
      status: row.status,
      contentJson,
      contentText: row.content_text,
      summary: row.summary ?? undefined,
      sourceMessageId: row.source_message_id ?? undefined,
      taskId: row.task_id ?? undefined,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(metadata ? { metadata } : {})
    };
  }

  private toPlan(row: PlanRow): Plan {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      workflowType: row.workflow_type,
      phase: row.phase,
      primaryGoal: row.primary_goal,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private toPlanStep(row: PlanStepRow): PlanStep {
    return {
      id: row.id,
      planId: row.plan_id,
      stepOrder: row.step_order,
      title: row.title,
      status: row.status,
      result: row.result ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private toCard(row: CardRow): Card {
    return {
      id: row.id,
      type: row.type,
      sourceId: row.source_id,
      title: row.title,
      summary: row.summary,
      archived: row.archived === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export function resolveDbPath(options: DbPathResolveOptions = {}): string {
  const env = options.env ?? process.env;
  const dbPath = env.WORKBENCH_DB_PATH?.trim();
  if (dbPath) return dbPath;
  const dataDir = env.WORKBENCH_DATA_DIR?.trim() || resolveDefaultProductDataDir(options.homeDir ?? homedir());
  return join(dataDir, "data.db");
}

function resolveDefaultProductDataDir(homeDir: string): string {
  const currentDir = join(homeDir, pinocchioDataDir);
  if (existsSync(currentDir)) return currentDir;
  const legacyDir = join(homeDir, legacyDeepSeekDataDir);
  if (existsSync(legacyDir) || existsSync(join(legacyDir, "data.db"))) return legacyDir;
  return currentDir;
}
}

namespace __core_storage_localJsonStorageAdapter {
import randomUUID = __ext_0.randomUUID;
import mkdir = __ext_9.mkdir;
import readdir = __ext_9.readdir;
import readFile = __ext_9.readFile;
import rename = __ext_9.rename;
import rm = __ext_9.rm;
import writeFile = __ext_9.writeFile;
import dirname = __ext_8.dirname;
import isAbsolute = __ext_8.isAbsolute;
import join = __ext_8.join;
import normalize = __ext_8.normalize;
import Result = __ext_1.Result;
import StorageError = __ext_1.StorageError;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
function fail(code: string, message: string, recoverable = true): Result<never, StorageError> {
  return { ok: false, error: { code, message, recoverable } };
}

export class LocalJsonStorageAdapter implements StorageAdapter {
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly rootDir = ".data") {}

  async readJson<T>(key: string, fallback: T): Promise<Result<T, StorageError>> {
    try {
      const text = await readFile(this.resolve(key), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      return { ok: true, value: text ? (JSON.parse(text) as T) : fallback };
    } catch (error) {
      return fail("STORAGE_READ_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  async writeJsonAtomic<T>(key: string, value: T): Promise<Result<void, StorageError>> {
    let target: string | undefined;
    let write: Promise<void> | undefined;
    try {
      const resolved = this.resolve(key);
      target = resolved;
      const previous = this.writeQueues.get(resolved) ?? Promise.resolve();
      write = previous.catch(() => undefined).then(() => this.writeAtomicFile(resolved, value));
      this.writeQueues.set(resolved, write);
      await write;
      return { ok: true, value: undefined };
    } catch (error) {
      return fail("STORAGE_WRITE_FAILED", error instanceof Error ? error.message : String(error));
    } finally {
      if (target && this.writeQueues.get(target) === write) this.writeQueues.delete(target);
    }
  }

  async delete(key: string): Promise<Result<void, StorageError>> {
    try {
      await rm(this.resolve(key), { force: true });
      return { ok: true, value: undefined };
    } catch (error) {
      return fail("STORAGE_DELETE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  async list(prefix: string): Promise<Result<string[], StorageError>> {
    try {
      const dir = this.resolve(prefix);
      const entries = await readdir(dir).catch(() => []);
      return { ok: true, value: entries.map((entry) => `${prefix}/${entry}`) };
    } catch (error) {
      return fail("STORAGE_LIST_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  private resolve(key: string): string {
    const normalized = normalize(key);
    if (normalized.startsWith("..") || normalize(key).includes("..")) {
      throw new Error("Path traversal rejected");
    }
    const root = normalize(isAbsolute(this.rootDir) ? this.rootDir : join(/*turbopackIgnore: true*/ process.cwd(), this.rootDir));
    const full = normalize(join(root, normalized));
    if (!full.startsWith(root)) throw new Error("Path traversal rejected");
    return full;
  }

  private async writeAtomicFile<T>(target: string, value: T): Promise<void> {
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
      await renameWithRetry(temp, target);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

async function renameWithRetry(source: string, target: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      if (!isRetryableRenameError(error) || attempt === 5) throw error;
      await sleep(25 * (attempt + 1));
    }
  }
}

function isRetryableRenameError(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
}

namespace __core_storage_conversationWorkspaceStore {
import existsSync = __ext_5.existsSync;
import mkdirSync = __ext_5.mkdirSync;
import readFileSync = __ext_5.readFileSync;
import readdirSync = __ext_5.readdirSync;
import rmSync = __ext_5.rmSync;
import writeFileSync = __ext_5.writeFileSync;
import homedir = __ext_7.homedir;
import dirname = __ext_8.dirname;
import join = __ext_8.join;
import normalize = __ext_8.normalize;
import Canvas = __ext_1.Canvas;
import Card = __ext_1.Card;
import CardListFilter = __ext_1.CardListFilter;
import ChatMessage = __ext_1.ChatMessage;
import Conversation = __ext_1.Conversation;
import CreateCanvasRequest = __ext_1.CreateCanvasRequest;
import CreateConversationRequest = __ext_1.CreateConversationRequest;
import Plan = __ext_1.Plan;
import PlanStep = __ext_1.PlanStep;
import Result = __ext_1.Result;
import StorageError = __ext_1.StorageError;
import UpdateCanvasRequest = __ext_1.UpdateCanvasRequest;
import UpdateConversationRequest = __ext_1.UpdateConversationRequest;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import LocalJsonStorageAdapter = __core_storage_localJsonStorageAdapter.LocalJsonStorageAdapter;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import PlanDraft = __core_storage_sqliteDatabase.PlanDraft;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
const conversationsDir = "conversations";
const manifestFile = "manifest.json";
const databaseFile = "conversation.db";
const unassignedId = "_unassigned";
const pinocchioDataDir = ".pinocchio";
const legacyDeepSeekDataDir = ".deepseek-workbench";

interface ConversationManifest {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface DataDirResolveOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
}

export class ConversationWorkspaceStore implements StorageAdapter {
  private readonly rootDir: string;

  constructor(rootDir = resolveWorkspaceDataDir()) {
    this.rootDir = normalize(rootDir);
    mkdirSync(join(this.rootDir, conversationsDir), { recursive: true });
  }

  rootPath(): string {
    return this.rootDir;
  }

  createConversation(input: CreateConversationRequest = {}): ConversationManifest {
    const now = nowIso();
    const manifest: ConversationManifest = {
      id: createId("conv"),
      title: input.title?.trim() || "New conversation",
      createdAt: now,
      updatedAt: now
    };
    this.writeManifestSync(manifest);
    return manifest;
  }

  ensureConversation(id: string, input: CreateConversationRequest = {}): ConversationManifest {
    const existing = this.getManifest(id);
    if (existing) return existing;
    const now = nowIso();
    const manifest: ConversationManifest = {
      id,
      title: input.title?.trim() || "New conversation",
      createdAt: now,
      updatedAt: now
    };
    this.writeManifestSync(manifest);
    return manifest;
  }

  updateConversation(id: string, input: UpdateConversationRequest): ConversationManifest {
    const current = this.requireManifest(id);
    const manifest = {
      ...current,
      title: input.title?.trim() || current.title,
      updatedAt: nowIso()
    };
    this.writeManifestSync(manifest);
    return manifest;
  }

  touchConversation(id: string, title?: string): ConversationManifest {
    const current = this.requireManifest(id);
    const manifest = {
      ...current,
      ...(title?.trim() ? { title: title.trim() } : {}),
      updatedAt: nowIso()
    };
    this.writeManifestSync(manifest);
    return manifest;
  }

  deleteConversation(id: string): void {
    rmSync(this.conversationPath(id), { recursive: true, force: true });
  }

  listManifests(): ConversationManifest[] {
    const root = join(this.rootDir, conversationsDir);
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isConversationFolder(entry.name))
      .flatMap((entry) => {
        const manifest = this.getManifest(entry.name);
        return manifest ? [manifest] : [];
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getManifest(id: string): ConversationManifest | undefined {
    try {
      const text = readFileSyncUtf8(join(this.conversationPath(id), manifestFile));
      return JSON.parse(text) as ConversationManifest;
    } catch {
      return undefined;
    }
  }

  requireManifest(id: string): ConversationManifest {
    const manifest = this.getManifest(id);
    if (!manifest) throw new Error("Conversation workspace not found");
    return manifest;
  }

  conversationPath(id: string | null | undefined): string {
    const normalized = normalizeConversationId(id);
    return join(this.rootDir, conversationsDir, normalized);
  }

  databasePath(id: string | null | undefined): string {
    return join(this.conversationPath(id), databaseFile);
  }

  storageForConversation(id: string | null | undefined): StorageAdapter {
    mkdirSync(this.conversationPath(id), { recursive: true });
    return new LocalJsonStorageAdapter(this.conversationPath(id));
  }

  async readJson<T>(key: string, fallback: T): Promise<Result<T, StorageError>> {
    return this.globalStorage().readJson(key, fallback);
  }

  async writeJsonAtomic<T>(key: string, value: T): Promise<Result<void, StorageError>> {
    return this.globalStorage().writeJsonAtomic(key, value);
  }

  async delete(key: string): Promise<Result<void, StorageError>> {
    return this.globalStorage().delete(key);
  }

  async list(prefix: string): Promise<Result<string[], StorageError>> {
    return this.globalStorage().list(prefix);
  }

  private writeManifestSync(manifest: ConversationManifest): void {
    const dir = this.conversationPath(manifest.id);
    mkdirSync(dir, { recursive: true });
    writeFileSyncUtf8(join(dir, manifestFile), JSON.stringify(manifest, null, 2));
  }

  private globalStorage(): StorageAdapter {
    return new LocalJsonStorageAdapter(this.rootDir);
  }
}

export class ConversationWorkspaceDatabase {
  private readonly databases = new Map<string, WorkbenchDatabase>();

  constructor(private readonly workspace: ConversationWorkspaceStore) {}

  dbForConversation(conversationId: string | null | undefined): WorkbenchDatabase {
    const id = normalizeConversationId(conversationId);
    const cached = this.databases.get(id);
    if (cached) return cached;
    if (id !== unassignedId) this.workspace.ensureConversation(id);
    mkdirSync(dirname(this.workspace.databasePath(id)), { recursive: true });
    const db = new WorkbenchDatabase(this.workspace.databasePath(id));
    this.databases.set(id, db);
    return db;
  }

  exec(sql: string): void {
    this.dbForConversation(undefined).exec(sql);
  }

  prepare(sql: string): ReturnType<WorkbenchDatabase["prepare"]> {
    return this.dbForConversation(undefined).prepare(sql);
  }

  allDatabases(): WorkbenchDatabase[] {
    const byPath = new Map<WorkbenchDatabase, WorkbenchDatabase>();
    for (const manifest of this.workspace.listManifests()) {
      const db = this.dbForConversation(manifest.id);
      byPath.set(db, db);
    }
    for (const db of this.databases.values()) byPath.set(db, db);
    return [...byPath.values()];
  }

  listConversations(): Conversation[] {
    return this.workspace.listManifests().flatMap((manifest) => {
      const conversation = this.dbForConversation(manifest.id).getConversation(manifest.id);
      return conversation ? [this.withManifest(conversation, manifest)] : [];
    });
  }

  getConversation(id: string): Conversation | undefined {
    const manifest = this.workspace.getManifest(id);
    if (!manifest) return undefined;
    const conversation = this.dbForConversation(id).getConversation(id);
    return conversation ? this.withManifest(conversation, manifest) : undefined;
  }

  createConversation(input: CreateConversationRequest = {}): Conversation {
    const manifest = this.workspace.createConversation(input);
    const conversation = this.dbForConversation(manifest.id).createConversation({ ...input, id: manifest.id } as CreateConversationRequest & { id: string });
    return this.withManifest(conversation, manifest);
  }

  updateConversation(id: string, input: UpdateConversationRequest): Conversation {
    const manifest = this.workspace.updateConversation(id, input);
    const conversation = this.dbForConversation(id).updateConversation(id, input);
    return this.withManifest(conversation, manifest);
  }

  deleteConversation(id: string): void {
    const cached = this.databases.get(id);
    if (cached) {
      cached.close();
      this.databases.delete(id);
    }
    this.workspace.deleteConversation(id);
  }

  appendMessages(conversationId: string, messages: ChatMessage[]): Conversation {
    const conversation = this.dbForConversation(conversationId).appendMessages(conversationId, messages);
    const manifest = this.workspace.touchConversation(conversationId);
    return this.withManifest(conversation, manifest);
  }

  listCanvases(conversationId?: string | null): Canvas[] {
    if (conversationId !== undefined) return this.dbForConversation(conversationId).listCanvases(conversationId);
    return this.allDatabases().flatMap((db) => db.listCanvases());
  }

  getCanvas(id: string): Canvas | undefined {
    return this.findDatabase((db) => db.getCanvas(id))?.value;
  }

  createCanvas(input: CreateCanvasRequest): Canvas {
    const canvas = this.dbForConversation(input.conversationId).createCanvas(input);
    if (input.conversationId) this.workspace.touchConversation(input.conversationId);
    return canvas;
  }

  updateCanvas(id: string, input: UpdateCanvasRequest): Canvas {
    const found = this.findDatabase((db) => db.getCanvas(id));
    if (!found) throw new Error("Canvas not found");
    const canvas = found.db.updateCanvas(id, input);
    if (canvas.conversationId) this.workspace.touchConversation(canvas.conversationId);
    return canvas;
  }

  deleteCanvas(id: string): void {
    const found = this.findDatabase((db) => db.getCanvas(id));
    found?.db.deleteCanvas(id);
  }

  listPlans(conversationId?: string | null): Plan[] {
    if (conversationId !== undefined) return this.dbForConversation(conversationId).listPlans(conversationId);
    return this.allDatabases().flatMap((db) => db.listPlans());
  }

  getPlan(id: string): Plan | undefined {
    return this.findDatabase((db) => db.getPlan(id))?.value;
  }

  createPlan(input: PlanDraft): Plan {
    const plan = this.dbForConversation(input.conversationId).createPlan(input);
    if (input.conversationId) this.workspace.touchConversation(input.conversationId);
    return plan;
  }

  updatePlan(id: string, patch: Partial<PlanDraft>): Plan {
    const found = this.findDatabase((db) => db.getPlan(id));
    if (!found) throw new Error("Plan not found");
    const plan = found.db.updatePlan(id, patch);
    if (plan.conversationId) this.workspace.touchConversation(plan.conversationId);
    return plan;
  }

  deletePlan(id: string): void {
    const found = this.findDatabase((db) => db.getPlan(id));
    found?.db.deletePlan(id);
  }

  listPlanSteps(planId: string): PlanStep[] {
    return this.findDatabase((db) => db.getPlan(planId))?.db.listPlanSteps(planId) ?? [];
  }

  replacePlanSteps(planId: string, steps: Omit<PlanStep, "planId">[]): PlanStep[] {
    const found = this.findDatabase((db) => db.getPlan(planId));
    if (!found) throw new Error("Plan not found");
    return found.db.replacePlanSteps(planId, steps);
  }

  updatePlanStep(id: string, patch: Partial<Omit<PlanStep, "id" | "planId" | "createdAt">>): PlanStep {
    for (const db of this.allDatabases()) {
      try {
        return db.updatePlanStep(id, patch);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Plan step not found") throw error;
      }
    }
    throw new Error("Plan step not found");
  }

  listCards(filter: CardListFilter = {}): Card[] {
    if (filter.conversationId) return this.dbForConversation(filter.conversationId).listCards(filter);
    return this.allDatabases().flatMap((db) => db.listCards(filter)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getCard(id: string): Card | undefined {
    return this.findDatabase((db) => db.getCard(id))?.value;
  }

  upsertCard(card: Card): Card {
    const sourceDb = this.dbForCardSource(card);
    const db = sourceDb ?? this.findDatabase((candidate) => candidate.getCard(card.id))?.db ?? this.dbForConversation(undefined);
    return db.upsertCard(card);
  }

  setCardArchived(id: string, archived: boolean): Card {
    const found = this.findDatabase((db) => db.getCard(id));
    if (!found) throw new Error("Card not found");
    return found.db.setCardArchived(id, archived);
  }

  deleteCard(id: string): void {
    this.findDatabase((db) => db.getCard(id))?.db.deleteCard(id);
  }

  close(): void {
    for (const db of this.databases.values()) db.close();
    this.databases.clear();
  }

  dbForCanvasProject(projectId: string): WorkbenchDatabase | undefined {
    return this.findDatabase((db) => db.prepare("SELECT id FROM canvas_projects WHERE id = ?").get(projectId))?.db;
  }

  dbForPlan(planId: string): WorkbenchDatabase | undefined {
    return this.findDatabase((db) => db.getPlan(planId))?.db;
  }

  private dbForCardSource(card: Card): WorkbenchDatabase | undefined {
    if (card.type === "chat") return this.workspace.getManifest(card.sourceId) ? this.dbForConversation(card.sourceId) : undefined;
    if (card.type === "plan") return this.findDatabase((db) => db.getPlan(card.sourceId))?.db;
    if (card.type === "canvas") return this.findDatabase((db) => db.getCanvas(card.sourceId))?.db;
    return undefined;
  }

  private findDatabase<T>(reader: (db: WorkbenchDatabase) => T | undefined): { db: WorkbenchDatabase; value: T } | undefined {
    for (const db of this.allDatabases()) {
      const value = reader(db);
      if (value !== undefined && value !== null) return { db, value };
    }
    return undefined;
  }

  private withManifest(conversation: Conversation, manifest: ConversationManifest): Conversation {
    return {
      ...conversation,
      title: manifest.title,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt
    };
  }
}

export function isConversationWorkspaceStore(value: unknown): value is ConversationWorkspaceStore {
  return value instanceof ConversationWorkspaceStore;
}

export function isConversationWorkspaceDatabase(value: unknown): value is ConversationWorkspaceDatabase {
  return value instanceof ConversationWorkspaceDatabase;
}

export function resolveWorkspaceDataDir(options: DataDirResolveOptions = {}): string {
  const env = options.env ?? process.env;
  const dbPath = env.WORKBENCH_DB_PATH?.trim();
  if (dbPath) return dirname(dbPath);
  const dataDir = env.WORKBENCH_DATA_DIR?.trim();
  if (dataDir) return dataDir;
  return resolveDefaultProductDataDir(options.homeDir ?? homedir());
}

function resolveDefaultProductDataDir(homeDir: string): string {
  const currentDir = join(homeDir, pinocchioDataDir);
  if (existsSync(currentDir)) return currentDir;
  const legacyDir = join(homeDir, legacyDeepSeekDataDir);
  if (existsSync(legacyDir) || existsSync(join(legacyDir, "data.db"))) return legacyDir;
  return currentDir;
}

function normalizeConversationId(id: string | null | undefined): string {
  if (id === null || id === undefined || id === "") return unassignedId;
  if (!isConversationFolder(id)) throw new Error(`Invalid conversation id: ${id}`);
  return id;
}

function isConversationFolder(id: string): boolean {
  return /^conv_[A-Za-z0-9_-]+$/.test(id) || id === unassignedId;
}

function readFileSyncUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

function writeFileSyncUtf8(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
}

namespace __core_canvasStudio_canvasStudioRows {
import AssetBlob = __ext_1.AssetBlob;
import CanvasAssetLink = __ext_1.CanvasAssetLink;
import CanvasNode = __ext_1.CanvasNode;
import CanvasExportJob = __ext_1.CanvasExportJob;
import CanvasExportJobFormat = __ext_1.CanvasExportJobFormat;
import CanvasOutput = __ext_1.CanvasOutput;
import CanvasProject = __ext_1.CanvasProject;
import CanvasProjectEngine = __ext_1.CanvasProjectEngine;
import CanvasProjectFile = __ext_1.CanvasProjectFile;
import CanvasProjectKind = __ext_1.CanvasProjectKind;
import CanvasProjectVersion = __ext_1.CanvasProjectVersion;
import CanvasRenderJob = __ext_1.CanvasRenderJob;
import CanvasReviewReport = __ext_1.CanvasReviewReport;
import CanvasStudioJobStatus = __ext_1.CanvasStudioJobStatus;
import MethodologyState = __ext_1.MethodologyState;
export type JsonObject = Record<string, unknown>;

export type ProjectRow = {
  id: string;
  conversation_id: string | null;
  kind: CanvasProjectKind;
  engine: CanvasProjectEngine;
  status: CanvasProject["status"];
  title: string;
  current_version_id: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

export type NodeRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  node_type: string;
  order_index: number;
  content_json: string;
  text: string | null;
  created_at: string;
  updated_at: string;
};

export type FileRow = {
  id: string;
  project_id: string;
  path: string;
  role: string;
  content_hash: string | null;
  text_content: string | null;
  created_at: string;
  updated_at: string;
};

export type VersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  reason: string;
  snapshot_json: string;
  created_by: string | null;
  created_at: string;
};

export type AssetBlobRow = {
  hash: string;
  mime: string;
  bytes: number;
  storage_uri: string;
  metadata: string | null;
  created_at: string;
};

export type AssetRow = {
  id: string;
  project_id: string;
  asset_hash: string;
  role: string;
  name: string;
  metadata: string | null;
  created_at: string;
};

export type RenderJobRow = {
  id: string;
  project_id: string;
  version_id: string | null;
  engine: CanvasProjectEngine;
  status: CanvasStudioJobStatus;
  input_json: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ExportJobRow = {
  id: string;
  project_id: string;
  version_id: string | null;
  format: CanvasExportJobFormat;
  status: CanvasStudioJobStatus;
  options_json: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type OutputRow = {
  id: string;
  project_id: string;
  job_id: string | null;
  output_type: string;
  asset_hash: string | null;
  storage_uri: string;
  metadata: string | null;
  created_at: string;
};

export type ReviewRow = {
  id: string;
  project_id: string;
  version_id: string | null;
  scope: string;
  score_json: string;
  findings_json: string;
  created_at: string;
};

export type MethodologyRow = {
  id: string;
  conversation_id: string | null;
  project_id: string | null;
  workflow_type: string;
  phase: string;
  primary_focus: string;
  state_json: string;
  created_at: string;
  updated_at: string;
};

export function defaultEngine(kind: CanvasProjectKind): CanvasProjectEngine {
  if (kind === "prototype" || kind === "app") return "prototype";
  if (kind === "deck") return "deck";
  if (kind === "image" || kind === "image_set") return "image";
  if (kind === "video") return "video";
  if (kind === "tool" || kind === "data") return "tool";
  return "document";
}

export function stringify(value: JsonObject | undefined): string {
  return JSON.stringify(value ?? {});
}

export function parseObject(value: string | null): JsonObject | undefined {
  const parsed = value ? (JSON.parse(value) as JsonObject) : {};
  return Object.keys(parsed).length ? parsed : undefined;
}

export function toProject(row: ProjectRow): CanvasProject {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    kind: row.kind,
    engine: row.engine,
    status: row.status,
    currentVersionId: row.current_version_id ?? undefined,
    metadata: parseObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toNode(row: NodeRow): CanvasNode {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id ?? undefined,
    nodeType: row.node_type,
    orderIndex: row.order_index,
    contentJson: JSON.parse(row.content_json) as JsonObject,
    text: row.text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toFile(row: FileRow): CanvasProjectFile {
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.path,
    role: row.role,
    contentHash: row.content_hash ?? undefined,
    textContent: row.text_content ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toVersion(row: VersionRow): CanvasProjectVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    versionNumber: row.version_number,
    reason: row.reason,
    snapshotJson: JSON.parse(row.snapshot_json) as JsonObject,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at
  };
}

export function toAssetBlob(row: AssetBlobRow): AssetBlob {
  return {
    hash: row.hash,
    mime: row.mime,
    bytes: row.bytes,
    storageUri: row.storage_uri,
    metadata: parseObject(row.metadata),
    createdAt: row.created_at
  };
}

export function toAsset(row: AssetRow): CanvasAssetLink {
  return {
    id: row.id,
    projectId: row.project_id,
    assetHash: row.asset_hash,
    role: row.role,
    name: row.name,
    metadata: parseObject(row.metadata),
    createdAt: row.created_at
  };
}

export function toRenderJob(row: RenderJobRow): CanvasRenderJob {
  return {
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id ?? undefined,
    engine: row.engine,
    status: row.status,
    inputJson: JSON.parse(row.input_json) as JsonObject,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toExportJob(row: ExportJobRow): CanvasExportJob {
  return {
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id ?? undefined,
    format: row.format,
    status: row.status,
    optionsJson: JSON.parse(row.options_json) as JsonObject,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toOutput(row: OutputRow): CanvasOutput {
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id ?? undefined,
    outputType: row.output_type,
    assetHash: row.asset_hash ?? undefined,
    storageUri: row.storage_uri,
    metadata: parseObject(row.metadata),
    createdAt: row.created_at
  };
}

export function toReview(row: ReviewRow): CanvasReviewReport {
  return {
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id ?? undefined,
    scope: row.scope,
    scoreJson: JSON.parse(row.score_json) as JsonObject,
    findingsJson: JSON.parse(row.findings_json) as unknown[],
    createdAt: row.created_at
  };
}

export function toMethodology(row: MethodologyRow): MethodologyState {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    projectId: row.project_id ?? undefined,
    workflowType: row.workflow_type,
    phase: row.phase,
    primaryFocus: row.primary_focus,
    stateJson: JSON.parse(row.state_json) as JsonObject,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
}

namespace __core_canvasStudio_canvasStudioStore {
import AssetHashSchema = __ext_1.AssetHashSchema;
import CanvasAssetLink = __ext_1.CanvasAssetLink;
import CanvasExportJob = __ext_1.CanvasExportJob;
import CanvasExportJobFormat = __ext_1.CanvasExportJobFormat;
import CanvasNode = __ext_1.CanvasNode;
import CanvasOutput = __ext_1.CanvasOutput;
import CanvasProject = __ext_1.CanvasProject;
import CanvasProjectEngine = __ext_1.CanvasProjectEngine;
import CanvasProjectFile = __ext_1.CanvasProjectFile;
import CanvasProjectVersion = __ext_1.CanvasProjectVersion;
import CanvasRenderJob = __ext_1.CanvasRenderJob;
import CanvasReviewReport = __ext_1.CanvasReviewReport;
import CanvasStudioJobStatus = __ext_1.CanvasStudioJobStatus;
import CreateCanvasProjectRequest = __ext_1.CreateCanvasProjectRequest;
import MethodologyState = __ext_1.MethodologyState;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import isConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.isConversationWorkspaceDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import AssetRow = __core_canvasStudio_canvasStudioRows.AssetRow;
import ExportJobRow = __core_canvasStudio_canvasStudioRows.ExportJobRow;
import FileRow = __core_canvasStudio_canvasStudioRows.FileRow;
import JsonObject = __core_canvasStudio_canvasStudioRows.JsonObject;
import MethodologyRow = __core_canvasStudio_canvasStudioRows.MethodologyRow;
import NodeRow = __core_canvasStudio_canvasStudioRows.NodeRow;
import OutputRow = __core_canvasStudio_canvasStudioRows.OutputRow;
import ProjectRow = __core_canvasStudio_canvasStudioRows.ProjectRow;
import RenderJobRow = __core_canvasStudio_canvasStudioRows.RenderJobRow;
import ReviewRow = __core_canvasStudio_canvasStudioRows.ReviewRow;
import VersionRow = __core_canvasStudio_canvasStudioRows.VersionRow;
import defaultEngine = __core_canvasStudio_canvasStudioRows.defaultEngine;
import stringify = __core_canvasStudio_canvasStudioRows.stringify;
import toAsset = __core_canvasStudio_canvasStudioRows.toAsset;
import toExportJob = __core_canvasStudio_canvasStudioRows.toExportJob;
import toFile = __core_canvasStudio_canvasStudioRows.toFile;
import toMethodology = __core_canvasStudio_canvasStudioRows.toMethodology;
import toNode = __core_canvasStudio_canvasStudioRows.toNode;
import toOutput = __core_canvasStudio_canvasStudioRows.toOutput;
import toProject = __core_canvasStudio_canvasStudioRows.toProject;
import toRenderJob = __core_canvasStudio_canvasStudioRows.toRenderJob;
import toReview = __core_canvasStudio_canvasStudioRows.toReview;
import toVersion = __core_canvasStudio_canvasStudioRows.toVersion;
type Db = Pick<WorkbenchDatabase, "prepare" | "exec">;
type DbBackend = Db | ConversationWorkspaceDatabase;

export class CanvasStudioStore {
  constructor(private readonly db: DbBackend) {}

  createProject(input: CreateCanvasProjectRequest): CanvasProject {
    const db = this.dbForConversation(input.conversationId);
    const now = nowIso();
    const id = createId("cprj");
    db
      .prepare(
        "INSERT INTO canvas_projects (id, conversation_id, kind, engine, status, title, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, input.conversationId ?? null, input.kind, input.engine ?? defaultEngine(input.kind), "active", input.title.trim(), stringify(input.metadata), now, now);
    return this.getProject(id)!;
  }

  createProjectBundle(input: CreateCanvasProjectRequest): {
    project: CanvasProject;
    files: CanvasProjectFile[];
    nodes: CanvasNode[];
    version?: CanvasProjectVersion;
  } {
    const db = this.dbForConversation(input.conversationId);
    db.exec("BEGIN IMMEDIATE");
    try {
      const project = this.createProject(input);
      const files = input.files?.map((file) => this.upsertFile({
        projectId: project.id,
        path: file.path,
        ...(file.role !== undefined ? { role: file.role } : {}),
        ...(file.contentHash !== undefined ? { contentHash: file.contentHash } : {}),
        ...(file.textContent !== undefined ? { textContent: file.textContent } : {})
      })) ?? [];
      const nodes = input.nodes?.map((node) => this.upsertNode({
        projectId: project.id,
        nodeType: node.nodeType,
        ...(node.id !== undefined ? { id: node.id } : {}),
        ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
        ...(node.orderIndex !== undefined ? { orderIndex: node.orderIndex } : {}),
        ...(node.contentJson !== undefined ? { contentJson: node.contentJson } : {}),
        ...(node.text !== undefined ? { text: node.text } : {})
      })) ?? [];
      const version = input.initialVersion
        ? this.insertVersion({
          projectId: project.id,
          reason: input.initialVersion.reason,
          snapshotJson: input.initialVersion.snapshotJson,
          ...(input.initialVersion.createdBy !== undefined ? { createdBy: input.initialVersion.createdBy } : {})
        })
        : undefined;
      db.exec("COMMIT");
      return { project: version ? this.getProject(project.id)! : project, files, nodes, ...(version ? { version } : {}) };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  getProject(id: string): CanvasProject | undefined {
    for (const db of this.allDbs()) {
      const row = db.prepare("SELECT * FROM canvas_projects WHERE id = ?").get(id) as ProjectRow | undefined;
      if (row) return toProject(row);
    }
    return undefined;
  }

  listProjects(conversationId?: string | null): CanvasProject[] {
    if (conversationId !== undefined) {
      const rows = this.dbForConversation(conversationId).prepare("SELECT * FROM canvas_projects WHERE conversation_id IS ? ORDER BY updated_at DESC, created_at DESC").all(conversationId) as ProjectRow[];
      return rows.map(toProject);
    }
    return this.allDbs()
      .flatMap((db) => (db.prepare("SELECT * FROM canvas_projects ORDER BY updated_at DESC, created_at DESC").all() as ProjectRow[]).map(toProject))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  updateProject(id: string, patch: { title?: string; metadata?: JsonObject }): CanvasProject {
    const current = this.assertProject(id);
    const db = this.dbForProject(id);
    const metadata = { ...(current.metadata ?? {}), ...(patch.metadata ?? {}) };
    db
      .prepare("UPDATE canvas_projects SET title = ?, metadata = ?, updated_at = ? WHERE id = ?")
      .run(patch.title?.trim() || current.title, stringify(metadata), nowIso(), id);
    return this.getProject(id)!;
  }

  upsertNode(input: { projectId: string; id?: string; parentId?: string; nodeType: string; orderIndex?: number; contentJson?: JsonObject; text?: string }): CanvasNode {
    const db = this.dbForProject(input.projectId);
    this.assertProject(input.projectId);
    this.assertParentNodeBelongs(input.projectId, input.parentId);
    const now = nowIso();
    const existing = input.id
      ? (db.prepare("SELECT * FROM canvas_nodes WHERE id = ? AND project_id = ?").get(input.id, input.projectId) as NodeRow | undefined)
      : undefined;
    if (existing) {
      db
        .prepare("UPDATE canvas_nodes SET parent_id = ?, node_type = ?, order_index = ?, content_json = ?, text = ?, updated_at = ? WHERE id = ?")
        .run(input.parentId ?? existing.parent_id, input.nodeType, input.orderIndex ?? existing.order_index, stringify(input.contentJson ?? (JSON.parse(existing.content_json) as JsonObject)), input.text ?? existing.text, now, existing.id);
      return this.getNode(existing.id)!;
    }
    const id = input.id ?? createId("cnode");
    const orderIndex = input.orderIndex ?? this.nextNodeOrder(input.projectId, input.parentId);
    db
      .prepare("INSERT INTO canvas_nodes (id, project_id, parent_id, node_type, order_index, content_json, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.parentId ?? null, input.nodeType, orderIndex, stringify(input.contentJson), input.text ?? null, now, now);
    return this.getNode(id)!;
  }

  getNode(id: string): CanvasNode | undefined {
    for (const db of this.allDbs()) {
      const row = db.prepare("SELECT * FROM canvas_nodes WHERE id = ?").get(id) as NodeRow | undefined;
      if (row) return toNode(row);
    }
    return undefined;
  }

  listNodes(projectId: string): CanvasNode[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM canvas_nodes WHERE project_id = ? ORDER BY parent_id, order_index ASC, created_at ASC").all(projectId) as NodeRow[];
    return rows.map(toNode);
  }

  upsertFile(input: { projectId: string; path: string; role?: string; contentHash?: string; textContent?: string }): CanvasProjectFile {
    const db = this.dbForProject(input.projectId);
    this.assertProject(input.projectId);
    const contentHash = this.normalizeOptionalHash(input.contentHash, db);
    const now = nowIso();
    const existing = db.prepare("SELECT * FROM canvas_files WHERE project_id = ? AND path = ?").get(input.projectId, input.path) as FileRow | undefined;
    if (existing) {
      db
        .prepare("UPDATE canvas_files SET role = ?, content_hash = ?, text_content = ?, updated_at = ? WHERE id = ?")
        .run(input.role ?? existing.role, contentHash ?? existing.content_hash, input.textContent ?? existing.text_content, now, existing.id);
      return this.getFile(existing.id)!;
    }
    const id = createId("cfile");
    db
      .prepare("INSERT INTO canvas_files (id, project_id, path, role, content_hash, text_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.path, input.role ?? "source", contentHash ?? null, input.textContent ?? null, now, now);
    return this.getFile(id)!;
  }

  getFile(id: string): CanvasProjectFile | undefined {
    for (const db of this.allDbs()) {
      const row = db.prepare("SELECT * FROM canvas_files WHERE id = ?").get(id) as FileRow | undefined;
      if (row) return toFile(row);
    }
    return undefined;
  }

  listFiles(projectId: string): CanvasProjectFile[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM canvas_files WHERE project_id = ? ORDER BY path ASC").all(projectId) as FileRow[];
    return rows.map(toFile);
  }

  createVersion(input: { projectId: string; reason: string; snapshotJson: JsonObject; createdBy?: string }): CanvasProjectVersion {
    const db = this.dbForProject(input.projectId);
    this.assertProject(input.projectId);
    db.exec("BEGIN IMMEDIATE");
    try {
      const version = this.insertVersion(input);
      db.exec("COMMIT");
      return version;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  getVersion(id: string): CanvasProjectVersion | undefined {
    for (const db of this.allDbs()) {
      const row = db.prepare("SELECT * FROM canvas_versions WHERE id = ?").get(id) as VersionRow | undefined;
      if (row) return toVersion(row);
    }
    return undefined;
  }

  listVersions(projectId: string): CanvasProjectVersion[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM canvas_versions WHERE project_id = ? ORDER BY version_number DESC").all(projectId) as VersionRow[];
    return rows.map(toVersion);
  }

  linkAsset(input: { projectId: string; assetHash: string; role?: string; name: string; metadata?: JsonObject }): CanvasAssetLink {
    const db = this.dbForProject(input.projectId);
    this.assertProject(input.projectId);
    const assetHash = this.normalizeHash(input.assetHash, db);
    const id = createId("cass");
    const now = nowIso();
    db
      .prepare("INSERT INTO canvas_assets (id, project_id, asset_hash, role, name, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, assetHash, input.role ?? "asset", input.name, stringify(input.metadata), now);
    return this.listAssets(input.projectId).find((asset) => asset.id === id)!;
  }

  listAssets(projectId: string): CanvasAssetLink[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM canvas_assets WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as AssetRow[];
    return rows.map(toAsset);
  }

  createRenderJob(input: { projectId: string; versionId?: string; engine?: CanvasProjectEngine; inputJson?: JsonObject }): CanvasRenderJob {
    const db = this.dbForProject(input.projectId);
    const project = this.assertProject(input.projectId);
    this.assertVersionBelongs(input.projectId, input.versionId);
    const engine = input.engine ?? project.engine;
    if (engine !== project.engine) throw new Error("Canvas Studio render engine must match project engine");
    const id = createId("rjob");
    const now = nowIso();
    db
      .prepare("INSERT INTO render_jobs (id, project_id, version_id, engine, status, input_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.versionId ?? null, engine, "queued", stringify(input.inputJson), now, now);
    return this.getRenderJob(id)!;
  }

  createExportJob(input: { projectId: string; versionId?: string; format: CanvasExportJobFormat; optionsJson?: JsonObject }): CanvasExportJob {
    const db = this.dbForProject(input.projectId);
    this.assertProject(input.projectId);
    this.assertVersionBelongs(input.projectId, input.versionId);
    const id = createId("ejob");
    const now = nowIso();
    db
      .prepare("INSERT INTO export_jobs (id, project_id, version_id, format, status, options_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.versionId ?? null, input.format, "queued", stringify(input.optionsJson), now, now);
    return this.getExportJob(id)!;
  }

  updateJob(id: string, type: "render", patch: { status: CanvasStudioJobStatus; error?: string }): CanvasRenderJob;
  updateJob(id: string, type: "export", patch: { status: CanvasStudioJobStatus; error?: string }): CanvasExportJob;
  updateJob(id: string, type: "render" | "export", patch: { status: CanvasStudioJobStatus; error?: string }): CanvasRenderJob | CanvasExportJob {
    const table = type === "render" ? "render_jobs" : "export_jobs";
    const db = this.dbForJob(id, type);
    db.prepare(`UPDATE ${table} SET status = ?, error = ?, updated_at = ? WHERE id = ?`).run(patch.status, patch.error ?? null, nowIso(), id);
    const job = type === "render" ? this.getRenderJob(id) : this.getExportJob(id);
    if (!job) throw new Error("Canvas Studio job not found");
    return job;
  }

  getRenderJob(id: string): CanvasRenderJob | undefined {
    for (const db of this.allDbs()) {
      const row = db.prepare("SELECT * FROM render_jobs WHERE id = ?").get(id) as RenderJobRow | undefined;
      if (row) return toRenderJob(row);
    }
    return undefined;
  }

  listRenderJobs(projectId: string): CanvasRenderJob[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM render_jobs WHERE project_id = ? ORDER BY updated_at DESC").all(projectId) as RenderJobRow[];
    return rows.map(toRenderJob);
  }

  getExportJob(id: string): CanvasExportJob | undefined {
    for (const db of this.allDbs()) {
      const row = db.prepare("SELECT * FROM export_jobs WHERE id = ?").get(id) as ExportJobRow | undefined;
      if (row) return toExportJob(row);
    }
    return undefined;
  }

  listExportJobs(projectId: string): CanvasExportJob[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM export_jobs WHERE project_id = ? ORDER BY updated_at DESC").all(projectId) as ExportJobRow[];
    return rows.map(toExportJob);
  }

  recordOutput(input: { projectId: string; jobId?: string; outputType: string; assetHash?: string; storageUri: string; metadata?: JsonObject }): CanvasOutput {
    const db = this.dbForProject(input.projectId);
    this.assertProject(input.projectId);
    if (input.jobId) this.assertJobBelongs(input.projectId, input.jobId);
    const assetHash = this.normalizeOptionalHash(input.assetHash, db);
    const id = createId("cout");
    const now = nowIso();
    db
      .prepare("INSERT INTO canvas_outputs (id, project_id, job_id, output_type, asset_hash, storage_uri, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.jobId ?? null, input.outputType, assetHash ?? null, input.storageUri, stringify(input.metadata), now);
    return this.listOutputs(input.projectId).find((output) => output.id === id)!;
  }

  listOutputs(projectId: string): CanvasOutput[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM canvas_outputs WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as OutputRow[];
    return rows.map(toOutput);
  }

  createReviewReport(input: { projectId: string; versionId?: string; scope: string; scoreJson?: JsonObject; findingsJson?: unknown[] }): CanvasReviewReport {
    const db = this.dbForProject(input.projectId);
    this.assertProject(input.projectId);
    this.assertVersionBelongs(input.projectId, input.versionId);
    const id = createId("crev");
    const now = nowIso();
    db
      .prepare("INSERT INTO review_reports (id, project_id, version_id, scope, score_json, findings_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.versionId ?? null, input.scope, stringify(input.scoreJson), JSON.stringify(input.findingsJson ?? []), now);
    return this.listReviewReports(input.projectId).find((report) => report.id === id)!;
  }

  listReviewReports(projectId: string): CanvasReviewReport[] {
    const rows = this.dbForProject(projectId).prepare("SELECT * FROM review_reports WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as ReviewRow[];
    return rows.map(toReview);
  }

  upsertMethodologyState(input: { conversationId?: string | null; projectId?: string; workflowType: string; phase: string; primaryFocus: string; stateJson?: JsonObject }): MethodologyState {
    const db = input.projectId ? this.dbForProject(input.projectId) : this.dbForConversation(input.conversationId ?? null);
    const current = this.getMethodologyState(input.projectId ? { projectId: input.projectId } : { conversationId: input.conversationId ?? null });
    const now = nowIso();
    if (current) {
      db
        .prepare("UPDATE methodology_states SET workflow_type = ?, phase = ?, primary_focus = ?, state_json = ?, updated_at = ? WHERE id = ?")
        .run(input.workflowType, input.phase, input.primaryFocus, stringify(input.stateJson), now, current.id);
      return this.getMethodologyState({ id: current.id })!;
    }
    const id = createId("meth");
    db
      .prepare("INSERT INTO methodology_states (id, conversation_id, project_id, workflow_type, phase, primary_focus, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.conversationId ?? null, input.projectId ?? null, input.workflowType, input.phase, input.primaryFocus, stringify(input.stateJson), now, now);
    return this.getMethodologyState({ id })!;
  }

  getMethodologyState(query: { id?: string; conversationId?: string | null; projectId?: string }): MethodologyState | undefined {
    const dbs = query.id ? this.allDbs() : [query.projectId ? this.dbForProject(query.projectId) : this.dbForConversation(query.conversationId ?? null)];
    for (const db of dbs) {
      const row = query.id
        ? (db.prepare("SELECT * FROM methodology_states WHERE id = ?").get(query.id) as MethodologyRow | undefined)
        : query.projectId
          ? (db.prepare("SELECT * FROM methodology_states WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1").get(query.projectId) as MethodologyRow | undefined)
          : (db.prepare("SELECT * FROM methodology_states WHERE conversation_id IS ? AND project_id IS NULL ORDER BY updated_at DESC LIMIT 1").get(query.conversationId ?? null) as MethodologyRow | undefined);
      if (row) return toMethodology(row);
    }
    return undefined;
  }

  private nextNodeOrder(projectId: string, parentId?: string): number {
    const row = this.dbForProject(projectId)
      .prepare("SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM canvas_nodes WHERE project_id = ? AND parent_id IS ?")
      .get(projectId, parentId ?? null) as { next_order: number };
    return row.next_order;
  }

  private assertProject(projectId: string): CanvasProject {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Canvas Studio project not found");
    return project;
  }

  private assertVersionBelongs(projectId: string, versionId?: string): void {
    if (!versionId) return;
    const row = this.dbForProject(projectId).prepare("SELECT id FROM canvas_versions WHERE id = ? AND project_id = ?").get(versionId, projectId);
    if (!row) throw new Error("Canvas Studio version does not belong to project");
  }

  private assertJobBelongs(projectId: string, jobId: string): void {
    const db = this.dbForProject(projectId);
    const render = db.prepare("SELECT id FROM render_jobs WHERE id = ? AND project_id = ?").get(jobId, projectId);
    const exported = db.prepare("SELECT id FROM export_jobs WHERE id = ? AND project_id = ?").get(jobId, projectId);
    if (!render && !exported) throw new Error("Canvas Studio job does not belong to project");
  }

  private assertParentNodeBelongs(projectId: string, parentId?: string): void {
    if (!parentId) return;
    const row = this.dbForProject(projectId).prepare("SELECT project_id FROM canvas_nodes WHERE id = ?").get(parentId) as { project_id: string } | undefined;
    if (!row) throw new Error("Canvas Studio parent node not found");
    if (row.project_id !== projectId) throw new Error("Canvas Studio parent node does not belong to project");
  }

  private insertVersion(input: { projectId: string; reason: string; snapshotJson: JsonObject; createdBy?: string }): CanvasProjectVersion {
    const db = this.dbForProject(input.projectId);
    const row = db.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM canvas_versions WHERE project_id = ?").get(input.projectId) as { next_version: number };
    const id = createId("cver");
    const now = nowIso();
    db
      .prepare("INSERT INTO canvas_versions (id, project_id, version_number, reason, snapshot_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, row.next_version, input.reason, stringify(input.snapshotJson), input.createdBy ?? null, now);
    db.prepare("UPDATE canvas_projects SET current_version_id = ?, updated_at = ? WHERE id = ?").run(id, now, input.projectId);
    return this.getVersion(id)!;
  }

  private normalizeOptionalHash(hash: string | undefined, db: Db): string | undefined {
    if (hash === undefined) return undefined;
    return this.normalizeHash(hash, db);
  }

  private normalizeHash(hash: string, db: Db): string {
    const parsed = AssetHashSchema.parse(hash);
    const row = db.prepare("SELECT hash FROM asset_blobs WHERE hash = ?").get(parsed);
    if (!row) throw new Error("Canvas asset blob not found");
    return parsed;
  }

  private dbForConversation(conversationId: string | null | undefined): Db {
    return isConversationWorkspaceDatabase(this.db)
      ? this.db.dbForConversation(conversationId)
      : this.db;
  }

  private dbForProject(projectId: string): Db {
    if (!isConversationWorkspaceDatabase(this.db)) return this.db;
    const db = this.db.dbForCanvasProject(projectId);
    if (!db) throw new Error("Canvas Studio project not found");
    return db;
  }

  private dbForJob(id: string, type: "render" | "export"): Db {
    const table = type === "render" ? "render_jobs" : "export_jobs";
    for (const db of this.allDbs()) {
      if (db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)) return db;
    }
    throw new Error("Canvas Studio job not found");
  }

  private allDbs(): Db[] {
    return isConversationWorkspaceDatabase(this.db) ? this.db.allDatabases() : [this.db];
  }
}
}

namespace __core_core_artifactManager {
const sanitizeHtml = __default_1;
import Artifact = __ext_1.Artifact;
import ArtifactType = __ext_1.ArtifactType;
import CanvasProjectFile = __ext_1.CanvasProjectFile;
import CanvasProjectKind = __ext_1.CanvasProjectKind;
import CreateArtifactRequest = __ext_1.CreateArtifactRequest;
import UpdateArtifactRequest = __ext_1.UpdateArtifactRequest;
import CanvasStudioStore = __core_canvasStudio_canvasStudioStore.CanvasStudioStore;
import isConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.isConversationWorkspaceStore;
import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
const key = "artifacts.json";

export interface ArtifactScope {
  conversationId?: string | null;
}

export class ArtifactManager {
  constructor(
    private readonly storage: StorageAdapter | ConversationWorkspaceStore,
    private readonly canvasStudio?: CanvasStudioStore
  ) {}

  async list(scope: ArtifactScope = {}): Promise<Artifact[]> {
    if (scope.conversationId !== undefined) return this.readArtifacts(this.storageForConversation(scope.conversationId));
    if (isConversationWorkspaceStore(this.storage)) {
      const artifacts = await Promise.all(this.storage.listManifests().map((manifest) => this.readArtifacts(this.storageForConversation(manifest.id))));
      return artifacts.flat();
    }
    const stored = await this.storage.readJson<Artifact[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return stored.value;
  }

  async get(id: string, scope: ArtifactScope = {}): Promise<Artifact | undefined> {
    return (await this.list(scope)).find((artifact) => artifact.id === id);
  }

  async create(input: CreateArtifactRequest): Promise<Artifact> {
    const storage = this.storageForConversation(metadataString(input.metadata, "conversationId") ?? null);
    const artifacts = await this.readArtifacts(storage);
    const now = nowIso();
    const artifact: Artifact = {
      id: createId("art"),
      type: input.type,
      title: input.title,
      content: sanitizeContent(input.type, input.content),
      version: 1,
      createdAt: now,
      updatedAt: now,
      metadata: { ...(input.metadata ?? {}), sandbox: input.type === "html" ? "scripts-disabled" : undefined }
    };
    const synced = this.syncCanvasProject(artifact, "create");
    await this.save([...artifacts, synced], storage);
    return synced;
  }

  async update(id: string, input: UpdateArtifactRequest, scope: ArtifactScope = {}): Promise<Artifact> {
    const storage = scope.conversationId === undefined ? await this.storageForArtifact(id) : this.storageForConversation(scope.conversationId);
    const artifacts = await this.readArtifacts(storage);
    const index = artifacts.findIndex((artifact) => artifact.id === id);
    if (index === -1) throw new Error("Artifact not found");
    const current = artifacts[index]!;
    const nextMetadata = this.updatedMetadata(current.metadata, input.metadata, scope);
    const updated: Artifact = {
      ...current,
      title: input.title ?? current.title,
      content: input.content === undefined ? current.content : sanitizeContent(current.type, input.content),
      metadata: nextMetadata,
      version: current.version + 1,
      updatedAt: nowIso()
    };
    const synced = this.syncCanvasProject(updated, "update");
    artifacts[index] = synced;
    await this.save(artifacts, storage);
    return synced;
  }

  async delete(id: string, scope: ArtifactScope = {}): Promise<void> {
    const storage = scope.conversationId === undefined ? await this.storageForArtifact(id) : this.storageForConversation(scope.conversationId);
    const artifacts = await this.readArtifacts(storage);
    const next = artifacts.filter((artifact) => artifact.id !== id);
    if (next.length === artifacts.length) throw new Error("Artifact not found");
    await this.save(next, storage);
  }

  private async readArtifacts(storage: StorageAdapter): Promise<Artifact[]> {
    const stored = await storage.readJson<Artifact[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return stored.value;
  }

  private async save(artifacts: Artifact[], storage: StorageAdapter): Promise<void> {
    const stored = await storage.writeJsonAtomic(key, artifacts);
    if (!stored.ok) throw new Error(stored.error.message);
  }

  private storageForConversation(conversationId: string | null | undefined): StorageAdapter {
    return isConversationWorkspaceStore(this.storage)
      ? this.storage.storageForConversation(conversationId)
      : this.storage;
  }

  private async storageForArtifact(id: string): Promise<StorageAdapter> {
    if (!isConversationWorkspaceStore(this.storage)) return this.storage;
    for (const manifest of this.storage.listManifests()) {
      const storage = this.storage.storageForConversation(manifest.id);
      if ((await this.readArtifacts(storage)).some((artifact) => artifact.id === id)) return storage;
    }
    return this.storage.storageForConversation(null);
  }

  private updatedMetadata(current: Artifact["metadata"], patch: UpdateArtifactRequest["metadata"], scope: ArtifactScope): Artifact["metadata"] {
    const requestedConversationId = metadataString(patch, "conversationId");
    const scopeConversationId = scope.conversationId ?? undefined;
    if (scopeConversationId && requestedConversationId && requestedConversationId !== scopeConversationId) {
      throw new Error("Artifact conversation mismatch");
    }
    return {
      ...(current ?? {}),
      ...(patch ?? {}),
      ...(scopeConversationId ? { conversationId: scopeConversationId } : {})
    };
  }

  private syncCanvasProject(artifact: Artifact, reason: "create" | "update"): Artifact {
    if (!this.canvasStudio) return artifact;
    const existingProjectId = metadataString(artifact.metadata, "canvasProjectId");
    const existingProject = existingProjectId ? this.canvasStudio.getProject(existingProjectId) : undefined;
    const project = existingProject ?? this.canvasStudio.createProject({
      conversationId: metadataString(artifact.metadata, "conversationId") ?? null,
      title: artifact.title,
      kind: canvasProjectKind(artifact.type),
      engine: "legacy_artifact",
      metadata: {
        source: "legacy_artifact",
        legacyArtifactId: artifact.id,
        legacyArtifactType: artifact.type
      }
    });
    const synced: Artifact = {
      ...artifact,
      metadata: { ...(artifact.metadata ?? {}), canvasProjectId: project.id }
    };
    const file = this.canvasStudio.upsertFile({
      projectId: project.id,
      path: artifactFilePath(synced.type),
      role: "artifact",
      textContent: synced.content
    });
    this.canvasStudio.createVersion({
      projectId: project.id,
      reason: `legacy_artifact:${reason}`,
      snapshotJson: legacyArtifactSnapshot(synced, file),
      createdBy: "artifact-manager"
    });
    return synced;
  }
}

export function sanitizeContent(type: ArtifactType, content: string): string {
  if (type !== "html" && type !== "newspaper") return content;
  return sanitizeHtml(content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "section", "article", "main"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height"],
      "*": ["class", "style", "aria-label"]
    },
    allowedSchemes: ["http", "https", "data"],
    disallowedTagsMode: "discard"
  });
}

function canvasProjectKind(type: ArtifactType): CanvasProjectKind {
  if (type === "html") return "app";
  if (type === "code") return "tool";
  return "document";
}

function artifactFilePath(type: ArtifactType): string {
  if (type === "html") return "index.html";
  if (type === "newspaper") return "newspaper.html";
  if (type === "code") return "artifact.txt";
  return "artifact.md";
}

function legacyArtifactSnapshot(artifact: Artifact, file: CanvasProjectFile): Record<string, unknown> {
  return {
    engine: "legacy_artifact",
    artifact: {
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      version: artifact.version,
      metadata: artifact.metadata ?? {}
    },
    files: [{
      id: file.id,
      path: file.path,
      role: file.role,
      textContent: file.textContent ?? ""
    }]
  };
}

function metadataString(metadata: Artifact["metadata"], key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
}

namespace __core_files_fileStore {
import FileChunk = __ext_1.FileChunk;
import UploadedFile = __ext_1.UploadedFile;
import isConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.isConversationWorkspaceStore;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
const filesKey = "files/files.json";
const chunksKey = "files/chunks.json";
const blobsKey = "files/blobs.json";

const allowedExtensions = new Set([".txt", ".md", ".json", ".csv", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const allowedMimes = new Set([
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/octet-stream"
]);

export interface FileUploadLimits {
  maxFileSizeMb: number;
  maxFileCount: number;
  ttlMs: number;
}

interface StoredFileBlob {
  fileId: string;
  mimeType: string;
  base64: string;
}

interface ConversationScopedOptions {
  conversationId?: string | null | undefined;
}

type ListChunksOptions = ConversationScopedOptions & { fileId?: string };
type UploadInput = ConversationScopedOptions & { name: string; mimeType: string; bytes: Uint8Array };

export class FileStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly limits: FileUploadLimits
  ) {}

  async listFiles(options: ConversationScopedOptions = {}): Promise<UploadedFile[]> {
    const storage = this.scopedStorage(options.conversationId);
    const stored = await storage.readJson<UploadedFile[]>(filesKey, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return this.withinTtl(stored.value);
  }

  async listChunks(input?: string | ListChunksOptions): Promise<FileChunk[]> {
    const options = typeof input === "string" ? { fileId: input } : (input ?? {});
    const storage = this.scopedStorage(options.conversationId);
    const stored = await storage.readJson<FileChunk[]>(chunksKey, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return options.fileId ? stored.value.filter((chunk) => chunk.fileId === options.fileId) : stored.value;
  }

  async getImageDataUrl(fileId: string, options: ConversationScopedOptions = {}): Promise<string> {
    const storage = this.scopedStorage(options.conversationId);
    const file = (await this.listFiles(options)).find((item) => item.id === fileId);
    if (!file) throw new Error("Uploaded file not found");
    if (!isImageFile(file.name, file.mimeType)) throw new Error("Uploaded file is not an image");
    const stored = await storage.readJson<StoredFileBlob[]>(blobsKey, []);
    if (!stored.ok) throw new Error(stored.error.message);
    const blob = stored.value.find((item) => item.fileId === fileId);
    if (!blob) throw new Error("Uploaded image payload not found");
    return `data:${blob.mimeType};base64,${blob.base64}`;
  }

  async upload(input: UploadInput): Promise<UploadedFile> {
    const storage = this.scopedStorage(input.conversationId);
    this.validate(input);
    const files = await this.listFiles(input);
    if (files.length >= this.limits.maxFileCount) throw new Error("Upload file count limit exceeded");
    const fileId = createId("file");
    const image = isImageFile(input.name, input.mimeType);
    const text = image
      ? `Image file: ${input.name}. Local preview and metadata are available with imageId=${fileId}. Detailed image-content recognition is not part of this DeepSeek-only build.`
      : await parseContent(input.name, input.bytes);
    const chunks = chunkText(fileId, text);
    const file: UploadedFile = {
      id: fileId,
      name: input.name,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      status: "parsed",
      chunkCount: chunks.length,
      createdAt: nowIso()
    };
    await storage.writeJsonAtomic(filesKey, [...files, file]);
    await storage.writeJsonAtomic(chunksKey, [...(await this.listChunks(input)), ...chunks]);
    if (image) {
      const stored = await storage.readJson<StoredFileBlob[]>(blobsKey, []);
      if (!stored.ok) throw new Error(stored.error.message);
      await storage.writeJsonAtomic(blobsKey, [
        ...stored.value.filter((item) => item.fileId !== fileId),
        { fileId, mimeType: normalizeImageMime(input.name, input.mimeType), base64: Buffer.from(input.bytes).toString("base64") }
      ]);
    }
    return file;
  }

  async cleanup(options: ConversationScopedOptions & { reserveSlots?: number } = {}): Promise<void> {
    const storage = this.scopedStorage(options.conversationId);
    const reserveSlots = Math.max(0, options.reserveSlots ?? 0);
    const maxRetained = Math.max(0, this.limits.maxFileCount - reserveSlots);
    const files = trimToNewest(await this.listFiles(options), maxRetained);
    const ids = new Set(files.map((file) => file.id));
    await storage.writeJsonAtomic(filesKey, files);
    await storage.writeJsonAtomic(
      chunksKey,
      (await this.listChunks(options)).filter((chunk) => ids.has(chunk.fileId))
    );
    const blobs = await storage.readJson<StoredFileBlob[]>(blobsKey, []);
    if (!blobs.ok) throw new Error(blobs.error.message);
    await storage.writeJsonAtomic(blobsKey, blobs.value.filter((blob) => ids.has(blob.fileId)));
  }

  private scopedStorage(conversationId: string | null | undefined): StorageAdapter {
    return isConversationWorkspaceStore(this.storage)
      ? this.storage.storageForConversation(conversationId)
      : this.storage;
  }

  private validate(input: { name: string; mimeType: string; bytes: Uint8Array }): void {
    const extension = input.name.slice(input.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.has(extension)) throw new Error(`Unsupported extension: ${extension}`);
    if (!allowedMimes.has(input.mimeType)) throw new Error(`Unsupported MIME type: ${input.mimeType}`);
    if (input.bytes.byteLength === 0) throw new Error("Empty files are not supported");
    if (input.bytes.byteLength > this.limits.maxFileSizeMb * 1024 * 1024) {
      throw new Error("File size limit exceeded");
    }
  }

  private withinTtl(files: UploadedFile[]): UploadedFile[] {
    const cutoff = Date.now() - this.limits.ttlMs;
    return files.filter((file) => Date.parse(file.createdAt) >= cutoff);
  }
}

function trimToNewest(files: UploadedFile[], limit: number): UploadedFile[] {
  if (files.length <= limit) return files;
  return [...files]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function isImageFile(name: string, mimeType: string): boolean {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension);
}

function normalizeImageMime(name: string, mimeType: string): string {
  if (mimeType.startsWith("image/")) return mimeType;
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

async function parseContent(name: string, bytes: Uint8Array): Promise<string> {
  if (name.toLowerCase().endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  return new TextDecoder("utf8").decode(bytes);
}

function chunkText(fileId: string, text: string): FileChunk[] {
  const size = 3000;
  const chunks: FileChunk[] = [];
  for (let offset = 0, index = 0; offset < text.length; offset += size, index += 1) {
    const content = text.slice(offset, offset + size);
    chunks.push({
      id: createId("chunk"),
      fileId,
      index,
      content,
      tokenEstimate: Math.ceil(content.length / 4)
    });
  }
  return chunks.length ? chunks : [{ id: createId("chunk"), fileId, index: 0, content: "", tokenEstimate: 0 }];
}
}

namespace __core_files_fileReaderErrors {

export type FileReaderErrorCode =
  | "WORKSPACE_PATH_INVALID"
  | "WORKSPACE_PATH_ABSOLUTE"
  | "WORKSPACE_PATH_TRAVERSAL"
  | "WORKSPACE_PATH_OUTSIDE_ROOT"
  | "WORKSPACE_PATH_NOT_ALLOWED"
  | "WORKSPACE_FILE_NOT_FOUND"
  | "WORKSPACE_PATH_NOT_FILE"
  | "WORKSPACE_PATH_NOT_DIRECTORY"
  | "WORKSPACE_FILE_BINARY";

export class FileReaderError extends Error {
  constructor(
    readonly code: FileReaderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileReaderError";
  }
}

export function fileReaderError(
  code: FileReaderErrorCode,
  detail?: string,
): FileReaderError {
  const suffix = detail ? `: ${detail}` : "";
  switch (code) {
    case "WORKSPACE_PATH_INVALID":
      return new FileReaderError(code, `Workspace path is invalid${suffix}`);
    case "WORKSPACE_PATH_ABSOLUTE":
      return new FileReaderError(
        code,
        `Workspace paths must be relative${suffix}`,
      );
    case "WORKSPACE_PATH_TRAVERSAL":
      return new FileReaderError(
        code,
        `Workspace path traversal is not allowed${suffix}`,
      );
    case "WORKSPACE_PATH_OUTSIDE_ROOT":
      return new FileReaderError(
        code,
        `Workspace path resolves outside the workspace root${suffix}`,
      );
    case "WORKSPACE_PATH_NOT_ALLOWED":
      return new FileReaderError(
        code,
        `Workspace path is not in the allowlist${suffix}`,
      );
    case "WORKSPACE_FILE_NOT_FOUND":
      return new FileReaderError(code, `Workspace file was not found${suffix}`);
    case "WORKSPACE_PATH_NOT_FILE":
      return new FileReaderError(code, `Workspace path is not a file${suffix}`);
    case "WORKSPACE_PATH_NOT_DIRECTORY":
      return new FileReaderError(
        code,
        `Workspace path is not a directory${suffix}`,
      );
    case "WORKSPACE_FILE_BINARY":
      return new FileReaderError(code, `Workspace file is binary${suffix}`);
  }
}
}

namespace __core_files_fileReaderTypes {

export type WorkspaceFileKind = "text" | "binary";

export interface WorkspaceFileType {
  path: string;
  extension: string;
  mimeType: string;
  kind: WorkspaceFileKind;
}

export interface WorkspaceFileReaderOptions {
  rootPath: string;
  allowedPaths?: string[] | undefined;
  maxReadBytes?: number | undefined;
  maxSearchBytes?: number | undefined;
  maxEntries?: number | undefined;
}

export interface WorkspaceReadInput {
  path: string;
  startLine?: number | undefined;
  endLine?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  maxBytes?: number | undefined;
}

export interface WorkspaceReadResult {
  path: string;
  mimeType: string;
  kind: "text";
  content: string;
  bytesRead: number;
  truncated: boolean;
  range?: {
    startLine: number;
    endLine: number;
  };
}

export interface WorkspaceListInput {
  path?: string | undefined;
  recursive?: boolean | undefined;
  includeDependencies?: boolean | undefined;
  maxEntries?: number | undefined;
}

export interface WorkspaceFileEntry {
  path: string;
  type: "file";
  size: number;
  mimeType: string;
  kind: WorkspaceFileKind;
}

export interface WorkspaceListResult {
  path: string;
  entries: WorkspaceFileEntry[];
  truncated: boolean;
}

export interface WorkspaceSearchInput {
  path?: string | undefined;
  query: string;
  maxResults?: number | undefined;
  maxBytesPerFile?: number | undefined;
  includeDependencies?: boolean | undefined;
}

export interface WorkspaceSearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface WorkspaceSearchResult {
  path: string;
  query: string;
  matches: WorkspaceSearchMatch[];
  truncated: boolean;
}

export interface WorkspaceTypeInput {
  path: string;
}

export interface WorkspaceTypeResult extends WorkspaceFileType {
  size: number;
}
}

namespace __core_files_fileMime {
import extname = __ext_8.extname;
import WorkspaceFileKind = __core_files_fileReaderTypes.WorkspaceFileKind;
import WorkspaceFileType = __core_files_fileReaderTypes.WorkspaceFileType;
const mimeByExtension = new Map<string, string>([
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".markdown", "text/markdown"],
  [".json", "application/json"],
  [".jsonl", "application/x-ndjson"],
  [".csv", "text/csv"],
  [".ts", "text/typescript"],
  [".tsx", "text/typescript"],
  [".js", "text/javascript"],
  [".jsx", "text/javascript"],
  [".mjs", "text/javascript"],
  [".cjs", "text/javascript"],
  [".css", "text/css"],
  [".scss", "text/x-scss"],
  [".html", "text/html"],
  [".htm", "text/html"],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
  [".toml", "application/toml"],
  [".ini", "text/plain"],
  [".log", "text/plain"],
  [".sql", "application/sql"],
  [".sh", "application/x-sh"],
  [".ps1", "text/plain"],
  [".bat", "text/plain"],
  [".svg", "image/svg+xml"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".zip", "application/zip"],
]);

const textExtensions = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".log",
  ".sql",
  ".sh",
  ".ps1",
  ".bat",
  ".svg",
]);

export function detectWorkspaceFileType(filePath: string): WorkspaceFileType {
  const extension = extname(filePath).toLowerCase();
  const mimeType = mimeByExtension.get(extension) ?? "application/octet-stream";
  return {
    path: filePath,
    extension,
    mimeType,
    kind: detectKind(extension, mimeType),
  };
}

function detectKind(extension: string, mimeType: string): WorkspaceFileKind {
  if (textExtensions.has(extension)) return "text";
  if (mimeType.startsWith("text/")) return "text";
  if (
    [
      "application/json",
      "application/xml",
      "application/yaml",
      "application/toml",
      "application/sql",
    ].includes(mimeType)
  )
    return "text";
  return "binary";
}
}

namespace __core_files_pathSecurity {
import realpath = __ext_9.realpath;
import isAbsolute = __ext_8.isAbsolute;
import normalize = __ext_8.normalize;
import relative = __ext_8.relative;
import resolve = __ext_8.resolve;
import fileReaderError = __core_files_fileReaderErrors.fileReaderError;
export interface ResolvedWorkspacePath {
  rootPath: string;
  absolutePath: string;
  relativePath: string;
}

export interface ResolveWorkspacePathOptions {
  rootPath: string;
  path: string;
  allowedPaths?: string[];
}

export async function resolveWorkspacePath(
  options: ResolveWorkspacePathOptions,
): Promise<ResolvedWorkspacePath> {
  const inputPath = normalizeRelativeInput(options.path);
  const rootPath = await realpath(options.rootPath);
  const absolutePath = resolve(rootPath, inputPath);
  if (isOutside(rootPath, absolutePath))
    throw fileReaderError("WORKSPACE_PATH_TRAVERSAL", options.path);

  let realTarget: string;
  try {
    realTarget = await realpath(absolutePath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT"))
      throw fileReaderError("WORKSPACE_FILE_NOT_FOUND", options.path);
    throw error;
  }
  if (isOutside(rootPath, realTarget))
    throw fileReaderError("WORKSPACE_PATH_OUTSIDE_ROOT", options.path);

  const relativePath = toPosix(relative(rootPath, realTarget)) || ".";
  const allowedPaths = normalizeAllowedPaths(options.allowedPaths);
  if (!isWorkspacePathAllowed(relativePath, allowedPaths))
    throw fileReaderError("WORKSPACE_PATH_NOT_ALLOWED", options.path);
  return { rootPath, absolutePath: realTarget, relativePath };
}

export function normalizeAllowedPaths(paths: string[] | undefined): string[] {
  return (paths ?? [])
    .map((path) => normalizeRelativeInput(path))
    .map((path) => (path === "." ? path : trimTrailingSlash(path)));
}

export function isWorkspacePathAllowed(
  relativePath: string,
  allowedPaths: string[],
): boolean {
  if (allowedPaths.length === 0 || relativePath === ".") return true;
  const normalized = trimTrailingSlash(toPosix(relativePath));
  return allowedPaths.some(
    (allowedPath) =>
      normalized === allowedPath || normalized.startsWith(`${allowedPath}/`),
  );
}

export function normalizeRelativeInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("\0"))
    throw fileReaderError("WORKSPACE_PATH_INVALID", input);
  if (isAbsolute(trimmed))
    throw fileReaderError("WORKSPACE_PATH_ABSOLUTE", input);
  const normalized = trimTrailingSlash(toPosix(normalize(trimmed)));
  if (normalized === ".." || normalized.split("/").includes(".."))
    throw fileReaderError("WORKSPACE_PATH_TRAVERSAL", input);
  return normalized || ".";
}

function isOutside(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath);
  return (
    relativePath !== "" &&
    (relativePath.startsWith("..") || isAbsolute(relativePath))
  );
}

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
}

namespace __core_files_workspaceFileReader {
import readdir = __ext_9.readdir;
import readFile = __ext_9.readFile;
import stat = __ext_9.stat;
import join = __ext_8.join;
import fileReaderError = __core_files_fileReaderErrors.fileReaderError;
import FileReaderError = __core_files_fileReaderErrors.FileReaderError;
import detectWorkspaceFileType = __core_files_fileMime.detectWorkspaceFileType;
import WorkspaceFileEntry = __core_files_fileReaderTypes.WorkspaceFileEntry;
import WorkspaceFileReaderOptions = __core_files_fileReaderTypes.WorkspaceFileReaderOptions;
import WorkspaceListInput = __core_files_fileReaderTypes.WorkspaceListInput;
import WorkspaceListResult = __core_files_fileReaderTypes.WorkspaceListResult;
import WorkspaceReadInput = __core_files_fileReaderTypes.WorkspaceReadInput;
import WorkspaceReadResult = __core_files_fileReaderTypes.WorkspaceReadResult;
import WorkspaceSearchInput = __core_files_fileReaderTypes.WorkspaceSearchInput;
import WorkspaceSearchMatch = __core_files_fileReaderTypes.WorkspaceSearchMatch;
import WorkspaceSearchResult = __core_files_fileReaderTypes.WorkspaceSearchResult;
import WorkspaceTypeInput = __core_files_fileReaderTypes.WorkspaceTypeInput;
import WorkspaceTypeResult = __core_files_fileReaderTypes.WorkspaceTypeResult;
import isWorkspacePathAllowed = __core_files_pathSecurity.isWorkspacePathAllowed;
import normalizeAllowedPaths = __core_files_pathSecurity.normalizeAllowedPaths;
import resolveWorkspacePath = __core_files_pathSecurity.resolveWorkspacePath;
const defaultMaxReadBytes = 128_000;
const defaultMaxSearchBytes = 512_000;
const defaultMaxEntries = 500;
const defaultMaxSearchResults = 100;
const ignoredDependencyDirs = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

export class WorkspaceFileReader {
  private readonly allowedPaths: string[];
  private readonly maxReadBytes: number;
  private readonly maxSearchBytes: number;
  private readonly maxEntries: number;

  constructor(private readonly options: WorkspaceFileReaderOptions) {
    this.allowedPaths = normalizeAllowedPaths(options.allowedPaths);
    this.maxReadBytes = options.maxReadBytes ?? defaultMaxReadBytes;
    this.maxSearchBytes = options.maxSearchBytes ?? defaultMaxSearchBytes;
    this.maxEntries = options.maxEntries ?? defaultMaxEntries;
  }

  async read(input: WorkspaceReadInput): Promise<WorkspaceReadResult> {
    const resolved = await this.resolve(input.path);
    const fileStat = await stat(resolved.absolutePath);
    if (!fileStat.isFile())
      throw fileReaderError("WORKSPACE_PATH_NOT_FILE", input.path);
    const type = detectWorkspaceFileType(resolved.relativePath);
    if (type.kind !== "text")
      throw fileReaderError("WORKSPACE_FILE_BINARY", input.path);

    const rawContent = new TextDecoder("utf8").decode(
      await readFile(resolved.absolutePath),
    );
    const ranged = selectLineRange(rawContent, input);
    const maxBytes = input.maxBytes ?? this.maxReadBytes;
    const truncated = truncateUtf8(ranged.content, maxBytes);
    return {
      path: resolved.relativePath,
      mimeType: type.mimeType,
      kind: "text",
      content: truncated.content,
      bytesRead: truncated.bytesRead,
      truncated: truncated.truncated,
      ...(ranged.range ? { range: ranged.range } : {}),
    };
  }

  async list(input: WorkspaceListInput = {}): Promise<WorkspaceListResult> {
    const requestedPath = input.path ?? ".";
    const resolved = await this.resolve(requestedPath);
    const rootStat = await stat(resolved.absolutePath);
    if (rootStat.isFile()) {
      return {
        path: resolved.relativePath,
        entries: [
          await this.entryFor(resolved.absolutePath, resolved.relativePath),
        ],
        truncated: false,
      };
    }
    if (!rootStat.isDirectory())
      throw fileReaderError("WORKSPACE_PATH_NOT_DIRECTORY", requestedPath);

    const entries: WorkspaceFileEntry[] = [];
    const maxEntries = input.maxEntries ?? this.maxEntries;
    await this.collectEntries(
      resolved.absolutePath,
      resolved.relativePath === "." ? "" : resolved.relativePath,
      {
        recursive: input.recursive === true,
        includeDependencies: input.includeDependencies === true,
        entries,
        maxEntries,
      },
    );
    entries.sort((left, right) => left.path.localeCompare(right.path));
    return {
      path: resolved.relativePath,
      entries,
      truncated: entries.length >= maxEntries,
    };
  }

  async search(input: WorkspaceSearchInput): Promise<WorkspaceSearchResult> {
    if (!input.query)
      throw fileReaderError(
        "WORKSPACE_PATH_INVALID",
        "search query is required",
      );
    const requestedPath = input.path ?? ".";
    const resolved = await this.resolve(requestedPath);
    const rootStat = await stat(resolved.absolutePath);
    const candidates = rootStat.isFile()
      ? [await this.entryFor(resolved.absolutePath, resolved.relativePath)]
      : (
          await this.list({
            path: requestedPath,
            recursive: true,
            includeDependencies: input.includeDependencies,
          })
        ).entries;
    const matches: WorkspaceSearchMatch[] = [];
    const maxResults = input.maxResults ?? defaultMaxSearchResults;
    for (const candidate of candidates) {
      if (candidate.kind !== "text") continue;
      const read = await this.read({
        path: candidate.path,
        maxBytes: input.maxBytesPerFile ?? this.maxSearchBytes,
      });
      for (const match of findMatches(
        candidate.path,
        read.content,
        input.query,
      )) {
        matches.push(match);
        if (matches.length >= maxResults)
          return {
            path: resolved.relativePath,
            query: input.query,
            matches,
            truncated: true,
          };
      }
    }
    return {
      path: resolved.relativePath,
      query: input.query,
      matches,
      truncated: false,
    };
  }

  async type(input: WorkspaceTypeInput): Promise<WorkspaceTypeResult> {
    const resolved = await this.resolve(input.path);
    const fileStat = await stat(resolved.absolutePath);
    if (!fileStat.isFile())
      throw fileReaderError("WORKSPACE_PATH_NOT_FILE", input.path);
    return {
      ...detectWorkspaceFileType(resolved.relativePath),
      size: fileStat.size,
    };
  }

  private async resolve(path: string) {
    return resolveWorkspacePath({
      rootPath: this.options.rootPath,
      path,
      allowedPaths: this.allowedPaths,
    });
  }

  private async collectEntries(
    absolutePath: string,
    relativePath: string,
    options: {
      recursive: boolean;
      includeDependencies: boolean;
      entries: WorkspaceFileEntry[];
      maxEntries: number;
    },
  ): Promise<void> {
    if (options.entries.length >= options.maxEntries) return;
    const dirents = await readdir(absolutePath, { withFileTypes: true });
    for (const dirent of dirents) {
      if (options.entries.length >= options.maxEntries) return;
      if (
        !options.includeDependencies &&
        dirent.isDirectory() &&
        ignoredDependencyDirs.has(dirent.name)
      )
        continue;
      const childRelativePath = relativePath
        ? `${relativePath}/${dirent.name}`
        : dirent.name;
      if (!isWorkspacePathAllowed(childRelativePath, this.allowedPaths))
        continue;
      const childPath = join(absolutePath, dirent.name);
      if (dirent.isDirectory()) {
        if (options.recursive)
          await this.collectEntries(childPath, childRelativePath, options);
        continue;
      }
      if (!dirent.isFile() && !dirent.isSymbolicLink()) continue;
      try {
        const resolved = await this.resolve(childRelativePath);
        const fileStat = await stat(resolved.absolutePath);
        if (fileStat.isFile())
          options.entries.push(
            await this.entryFor(resolved.absolutePath, resolved.relativePath),
          );
      } catch (error) {
        if (!(error instanceof FileReaderError)) throw error;
      }
    }
  }

  private async entryFor(
    absolutePath: string,
    relativePath: string,
  ): Promise<WorkspaceFileEntry> {
    const fileStat = await stat(absolutePath);
    const type = detectWorkspaceFileType(relativePath);
    return {
      path: relativePath,
      type: "file",
      size: fileStat.size,
      mimeType: type.mimeType,
      kind: type.kind,
    };
  }
}

function selectLineRange(
  content: string,
  input: WorkspaceReadInput,
): { content: string; range?: { startLine: number; endLine: number } } {
  const pageSize = input.pageSize;
  if (
    input.page !== undefined ||
    pageSize !== undefined ||
    input.startLine !== undefined ||
    input.endLine !== undefined
  ) {
    const lines = content.split(/\r?\n/);
    const startLine =
      input.page !== undefined
        ? (input.page - 1) * (pageSize ?? 200) + 1
        : (input.startLine ?? 1);
    const endLine =
      input.page !== undefined
        ? startLine + (pageSize ?? 200) - 1
        : (input.endLine ?? lines.length);
    const safeStart = Math.max(1, startLine);
    const safeEnd = Math.max(safeStart, endLine);
    return {
      content: lines.slice(safeStart - 1, safeEnd).join("\n"),
      range: { startLine: safeStart, endLine: Math.min(safeEnd, lines.length) },
    };
  }
  return { content };
}

function truncateUtf8(
  content: string,
  maxBytes: number,
): { content: string; bytesRead: number; truncated: boolean } {
  const encoded = new TextEncoder().encode(content);
  if (encoded.byteLength <= maxBytes)
    return { content, bytesRead: encoded.byteLength, truncated: false };
  const truncatedBytes = encoded.slice(0, Math.max(0, maxBytes));
  return {
    content: new TextDecoder("utf8").decode(truncatedBytes),
    bytesRead: truncatedBytes.byteLength,
    truncated: true,
  };
}

function findMatches(
  path: string,
  content: string,
  query: string,
): WorkspaceSearchMatch[] {
  const matches: WorkspaceSearchMatch[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const column = line.indexOf(query);
    if (column >= 0) {
      matches.push({
        path,
        line: index + 1,
        column: column + 1,
        preview: line.trimEnd(),
      });
    }
  });
  return matches;
}
}

namespace __core_memory_memoryStore {
import resolveMemoryTier = __ext_1.resolveMemoryTier;
import MemoryCandidate = __ext_1.MemoryCandidate;
import MemoryItem = __ext_1.MemoryItem;
import MemoryTier = __ext_1.MemoryTier;
import isConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.isConversationWorkspaceStore;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
const itemKey = "memory/items.json";
const candidateKey = "memory/candidates.json";

interface MemoryScope {
  conversationId?: string | null;
}

export class MemoryStore {
  constructor(private readonly storage: StorageAdapter) {}

  async list(scope: MemoryScope = {}): Promise<MemoryItem[]> {
    const stored = await this.scopedStorage(scope).readJson<MemoryItem[]>(itemKey, []);
    if (!stored.ok) throw new Error(stored.error.message);
    const now = Date.now();
    return stored.value.filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > now);
  }

  async listCandidates(scope: MemoryScope = {}): Promise<MemoryCandidate[]> {
    const stored = await this.scopedStorage(scope).readJson<MemoryCandidate[]>(candidateKey, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return stored.value;
  }

  async addCandidate(candidate: MemoryCandidate, scope: MemoryScope = {}): Promise<void> {
    await this.writeCandidates([...(await this.listCandidates(scope)), candidate], scope);
  }

  async confirm(candidateId: string, scope: MemoryScope = {}): Promise<MemoryItem> {
    const candidates = await this.listCandidates(scope);
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error("Memory candidate not found");
    const now = nowIso();
    const item: MemoryItem = {
      id: candidate.id.replace("memcand", "mem"),
      content: candidate.content,
      source: candidate.source,
      confidence: candidate.confidence,
      tier: resolveMemoryTier({ tags: candidate.tags }),
      tags: candidate.tags.filter((tag) => tag !== "user-confirmation-required"),
      createdAt: now,
      updatedAt: now
    };
    await this.writeItems([...(await this.list(scope)), item], scope);
    await this.writeCandidates(candidates.filter((entry) => entry.id !== candidateId), scope);
    return item;
  }

  async delete(id: string, scope: MemoryScope = {}): Promise<void> {
    await this.writeItems((await this.list(scope)).filter((item) => item.id !== id), scope);
  }

  async addLayered(input: {
    tier: MemoryTier;
    content: string;
    source: string;
    confidence: number;
    tags?: string[];
    expiresAt?: string;
  }, scope: MemoryScope = {}): Promise<MemoryItem> {
    const now = nowIso();
    const item: MemoryItem = {
      id: createId("mem"),
      content: input.content,
      source: input.source,
      confidence: input.confidence,
      tier: input.tier,
      tags: [`tier:${input.tier}`, ...(input.tags ?? [])],
      createdAt: now,
      updatedAt: now,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
    };
    await this.writeItems([...(await this.list(scope)), item], scope);
    return item;
  }

  async listByTier(tier: MemoryTier, scope: MemoryScope = {}): Promise<MemoryItem[]> {
    return (await this.list(scope)).filter((item) => resolveMemoryTier(item) === tier);
  }

  private async writeItems(items: MemoryItem[], scope: MemoryScope): Promise<void> {
    const saved = await this.scopedStorage(scope).writeJsonAtomic(itemKey, items);
    if (!saved.ok) throw new Error(saved.error.message);
  }

  private async writeCandidates(candidates: MemoryCandidate[], scope: MemoryScope): Promise<void> {
    const saved = await this.scopedStorage(scope).writeJsonAtomic(candidateKey, candidates);
    if (!saved.ok) throw new Error(saved.error.message);
  }

  private scopedStorage(scope: MemoryScope): StorageAdapter {
    return scope.conversationId !== undefined && isConversationWorkspaceStore(this.storage)
      ? this.storage.storageForConversation(scope.conversationId)
      : this.storage;
  }
}
}

namespace __core_obsidian_obsidianVaultBridge {
import mkdir = __ext_9.mkdir;
import realpath = __ext_9.realpath;
import writeFile = __ext_9.writeFile;
import isAbsolute = __ext_8.isAbsolute;
import join = __ext_8.join;
import relative = __ext_8.relative;
import resolve = __ext_8.resolve;
import nowIso = __core_utils_id.nowIso;
export interface ObsidianVaultBridgeOptions {
  vaultPath: string;
  folder?: string;
}

export interface ObsidianExportInput {
  title: string;
  content: string;
  tags?: string[];
  links?: string[];
  source?: {
    type: string;
    id: string;
  };
}

export interface ObsidianExportResult {
  path: string;
  relativePath: string;
}

export class ObsidianVaultBridge {
  constructor(private readonly options: ObsidianVaultBridgeOptions) {}

  async exportMarkdown(input: ObsidianExportInput): Promise<ObsidianExportResult> {
    const folder = normalizeFolder(this.options.folder);
    const vaultPath = resolve(/*turbopackIgnore: true*/ this.options.vaultPath);
    const dir = await prepareVaultDirectory(vaultPath, folder);
    const baseFilename = sanitizeFilename(input.title);
    const { filename, path } = await writeUniqueNote(dir, baseFilename, renderNote(input));
    const relativePath = folder ? `${folder}/${filename}` : filename;
    return { path, relativePath };
  }
}

function renderNote(input: ObsidianExportInput): string {
  const tags = JSON.stringify(input.tags ?? []);
  const links = input.links?.length ? `\n\n${input.links.map((link) => `[[${link}]]`).join(" ")}` : "";
  return [
    "---",
    `title: ${JSON.stringify(input.title)}`,
    `created: ${nowIso()}`,
    `tags: ${tags}`,
    ...(input.source ? [`source_type: ${input.source.type}`, `source_id: ${input.source.id}`] : []),
    "---",
    "",
    input.content.trim(),
    links,
    ""
  ].join("\n");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
}

async function writeUniqueNote(dir: string, baseFilename: string, content: string): Promise<{ filename: string; path: string }> {
  for (let attempt = 1; attempt <= 100; attempt++) {
    const filename = attempt === 1 ? `${baseFilename}.md` : `${baseFilename} ${attempt}.md`;
    const path = join(/*turbopackIgnore: true*/ dir, filename);
    try {
      await writeFile(/*turbopackIgnore: true*/ path, content, { encoding: "utf8", flag: "wx" });
      return { filename, path };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }
  throw new Error(`Unable to create a unique Obsidian note name for ${baseFilename}`);
}

async function prepareVaultDirectory(vaultPath: string, folder: string): Promise<string> {
  await mkdir(/*turbopackIgnore: true*/ vaultPath, { recursive: true });
  const realVaultPath = await realpath(/*turbopackIgnore: true*/ vaultPath);
  const targetPath = ensureInsideVault(vaultPath, folder ? resolve(/*turbopackIgnore: true*/ vaultPath, folder) : vaultPath);
  await assertExistingPathSegmentsStayInside(realVaultPath, vaultPath, folder);
  await mkdir(/*turbopackIgnore: true*/ targetPath, { recursive: true });
  ensureInsideVault(realVaultPath, await realpath(/*turbopackIgnore: true*/ targetPath));
  return targetPath;
}

async function assertExistingPathSegmentsStayInside(realVaultPath: string, vaultPath: string, folder: string): Promise<void> {
  let current = vaultPath;
  for (const segment of folder.split("/").filter(Boolean)) {
    current = join(/*turbopackIgnore: true*/ current, segment);
    try {
      ensureInsideVault(realVaultPath, await realpath(/*turbopackIgnore: true*/ current));
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
  }
}

function normalizeFolder(folder: string | undefined): string {
  return (folder ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function ensureInsideVault(vaultPath: string, targetPath: string): string {
  const relation = relative(vaultPath, targetPath);
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) return targetPath;
  throw new Error("Obsidian export folder must stay inside the configured Obsidian vault");
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
}

namespace __core_plugins_pluginManager {
import readFile = __ext_9.readFile;
import readdir = __ext_9.readdir;
import join = __ext_8.join;
import Worker = __ext_10.Worker;
import z = __ext_2.z;
import isModelToolName = __core_core_toolRouter.isModelToolName;
import ToolRouter = __core_core_toolRouter.ToolRouter;
export type PluginLoadStatus = "loaded" | "skipped" | "failed";

export interface LoadedPlugin {
  id: string;
  status: PluginLoadStatus;
  tools: string[];
  errors: string[];
}

export interface PluginManagerOptions {
  pluginRoot: string;
  toolRouter: ToolRouter;
  executionTimeoutMs?: number;
}

interface ToolModule {
  name?: unknown;
  description?: unknown;
  parameters?: JsonSchema;
  execute?: unknown;
}

interface RestrictedToolModule {
  name?: unknown;
  description?: unknown;
  parameters?: JsonSchema;
  hasExecute: boolean;
  transformedSource: string;
}

interface PluginManifest {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  trust?: unknown;
  permissions?: unknown;
}

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

const loadTimeoutMs = 250;
const defaultExecutionTimeoutMs = 1000;
const maxWorkerResultJsonLength = 1024 * 1024;
const restrictedWorkerResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4
};

export class PluginManager {
  private statuses: LoadedPlugin[] = [];

  constructor(private readonly options: PluginManagerOptions) {}

  async loadAll(): Promise<LoadedPlugin[]> {
    const entries = await readdir(this.options.pluginRoot, { withFileTypes: true }).catch(() => []);
    const loaded: LoadedPlugin[] = [];
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        loaded.push(await this.loadPlugin(entry.name));
      } catch (error) {
        loaded.push({
          id: entry.name,
          status: "failed",
          tools: [],
          errors: [`Plugin load failed: ${formatError(error)}`]
        });
      }
    }
    this.statuses = loaded;
    return loaded;
  }

  getStatus(pluginId: string): LoadedPlugin | undefined {
    return this.statuses.find((status) => status.id === pluginId);
  }

  listStatuses(): LoadedPlugin[] {
    return [...this.statuses];
  }

  private async loadPlugin(pluginId: string): Promise<LoadedPlugin> {
    if (!isModelToolName(pluginId)) {
      return { id: pluginId, status: "failed", tools: [], errors: [`Invalid plugin id: ${pluginId}`] };
    }
    const manifest = await this.readManifest(pluginId);
    if (!manifest.ok) {
      return { id: pluginId, status: "failed", tools: [], errors: [manifest.error] };
    }
    const trust = manifest.value?.trust;
    if (trust !== undefined && trust !== "restricted") {
      return {
        id: pluginId,
        status: "skipped",
        tools: [],
        errors: [`Unsupported trust level for plugin ${pluginId}: ${String(trust)}. Only restricted plugins can be loaded.`]
      };
    }

    const toolsDir = join(this.options.pluginRoot, pluginId, "tools");
    const files = await readdir(toolsDir, { withFileTypes: true }).catch(() => []);
    const tools: string[] = [];
    const errors: string[] = [];
    for (const file of files.filter((item) => item.isFile() && item.name.endsWith(".js")).sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const mod = await loadRestrictedToolModule(join(toolsDir, file.name));
        if (typeof mod.name !== "string" || typeof mod.description !== "string" || !mod.hasExecute) {
          throw new Error("Restricted tool must export string name, string description, and execute function");
        }
        const namespaced = `${pluginId}_${mod.name}`;
        if (!isModelToolName(mod.name) || !isModelToolName(namespaced)) {
          throw new Error(`Invalid plugin tool name: ${namespaced}`);
        }
        const schema = jsonSchemaToZod(mod.parameters);
        this.options.toolRouter.register({
          name: namespaced,
          description: mod.description,
          runtimeInputSchema: schema,
          modelInputSchema: schema,
          execute: async (input, ctx) => await executeRestrictedToolModule(
            mod.transformedSource,
            input,
            { pluginId, requestId: ctx.requestId },
            this.options.executionTimeoutMs ?? defaultExecutionTimeoutMs
          )
        });
        tools.push(namespaced);
      } catch (error) {
        errors.push(`${file.name}: ${formatError(error)}`);
      }
    }
    const status: PluginLoadStatus = errors.length > 0 && tools.length === 0 ? "failed" : "loaded";
    return { id: pluginId, status, tools, errors };
  }

  private async readManifest(pluginId: string): Promise<{ ok: true; value: PluginManifest | undefined } | { ok: false; error: string }> {
    const manifestPath = join(this.options.pluginRoot, pluginId, "plugin.json");
    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch (error) {
      if (isNotFound(error)) return { ok: true, value: undefined };
      return { ok: false, error: `Unable to read manifest for plugin ${pluginId}: ${formatError(error)}` };
    }
    try {
      const parsed = JSON.parse(raw) as PluginManifest;
      return { ok: true, value: parsed };
    } catch (error) {
      return { ok: false, error: `Invalid manifest for plugin ${pluginId}: ${formatError(error)}` };
    }
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadRestrictedToolModule(filePath: string): Promise<RestrictedToolModule> {
  const source = await readFile(filePath, "utf8");
  assertRestrictedSource(source);
  const transformed = transformRestrictedExports(source);
  const mod = await runRestrictedPluginWorker<{ module: ToolModule }>({
    mode: "load",
    transformedSource: transformed,
    timeoutMs: loadTimeoutMs,
    maxResultJsonLength: maxWorkerResultJsonLength,
    filename: filePath
  });
  return {
    name: mod.module.name,
    description: mod.module.description,
    hasExecute: mod.module.execute === true,
    transformedSource: transformed,
    ...(mod.module.parameters ? { parameters: mod.module.parameters } : {})
  };
}

async function executeRestrictedToolModule(transformedSource: string, input: unknown, ctx: { pluginId: string; requestId: string }, timeoutMs: number): Promise<unknown> {
  const response = await runRestrictedPluginWorker<{ result: unknown }>({
    mode: "execute",
    transformedSource,
    timeoutMs,
    maxResultJsonLength: maxWorkerResultJsonLength,
    inputJson: JSON.stringify(input),
    ctxJson: JSON.stringify(ctx)
  });
  return response.result;
}

function assertRestrictedSource(source: string): void {
  const forbidden = [
    /\bimport\s*(?:[\s{*]|\()/,
    /\brequire\s*\(/,
    /\bprocess\b/,
    /\bglobalThis\b/,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bconstructor\b/
  ];
  if (forbidden.some((pattern) => pattern.test(source))) {
    throw new Error("Restricted plugins cannot import modules or access host globals");
  }
}

function transformRestrictedExports(source: string): string {
  const transformed = source
    .replace(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=/g, "exports.$1 =")
    .replace(/\bexport\s+let\s+([A-Za-z_$][\w$]*)\s*=/g, "exports.$1 =")
    .replace(/\bexport\s+var\s+([A-Za-z_$][\w$]*)\s*=/g, "exports.$1 =")
    .replace(/\bexport\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, "exports.$1 = async function $1(")
    .replace(/\bexport\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, "exports.$1 = function $1(");
  if (/\bexport\b/.test(transformed)) {
    throw new Error("Restricted plugins only support named const/function exports");
  }
  return transformed;
}

type RestrictedPluginWorkerRequest = {
  mode: "load" | "execute";
  transformedSource: string;
  timeoutMs: number;
  maxResultJsonLength: number;
  filename?: string;
  inputJson?: string;
  ctxJson?: string;
};

function runRestrictedPluginWorker<T>(request: RestrictedPluginWorkerRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(restrictedPluginWorkerSource, {
      eval: true,
      workerData: request,
      resourceLimits: restrictedWorkerResourceLimits
    });
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      reject(new Error(`Restricted plugin timed out after ${request.timeoutMs}ms`));
    }, request.timeoutMs);
    worker.once("message", (message: { ok: boolean; error?: string } & T) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      void worker.terminate();
      if (message.ok) resolve(message);
      else reject(new Error(message.error ?? "Restricted plugin failed"));
    });
    worker.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      void worker.terminate();
      reject(error);
    });
    worker.once("exit", (code) => {
      if (settled || code === 0) return;
      settled = true;
      clearTimeout(watchdog);
      reject(new Error(`Restricted plugin worker exited with code ${code}`));
    });
  });
}

const restrictedPluginWorkerSource = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const { runInNewContext } = require("node:vm");

function postOk(payload) {
  const encoded = JSON.stringify(payload);
  if (encoded.length > workerData.maxResultJsonLength) {
    throw new Error("Restricted plugin result exceeded the maximum allowed size");
  }
  parentPort.postMessage({ ok: true, ...JSON.parse(encoded) });
}

function serializeModule(exports) {
  return {
    name: exports.name,
    description: exports.description,
    parameters: exports.parameters,
    execute: typeof exports.execute === "function" ? true : undefined
  };
}

function createSandbox() {
  return { exports: Object.create(null) };
}

function runScript(code, sandbox, timeoutMs, filename) {
  return runInNewContext(code, sandbox, {
    filename,
    timeout: timeoutMs,
    displayErrors: false,
    contextCodeGeneration: { strings: false, wasm: false }
  });
}

(async () => {
  const sandbox = createSandbox();
  runScript(workerData.transformedSource, sandbox, workerData.timeoutMs, workerData.filename);
  if (workerData.mode === "load") {
    postOk({ module: serializeModule(sandbox.exports) });
    return;
  }
  sandbox.__inputJson = workerData.inputJson || "{}";
  sandbox.__ctxJson = workerData.ctxJson || "{}";
  const execution = runScript(
    "Promise.resolve(exports.execute(JSON.parse(__inputJson), JSON.parse(__ctxJson)))",
    sandbox,
    workerData.timeoutMs,
    workerData.filename
  );
  const result = await Promise.race([
    execution,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Restricted plugin execution timed out")), workerData.timeoutMs))
  ]);
  postOk({ result: JSON.parse(JSON.stringify(result ?? null)) });
})().catch((error) => {
  parentPort.postMessage({ ok: false, error: error && error.message ? error.message : String(error) });
});
`;

function jsonSchemaToZod(schema: JsonSchema | undefined): z.ZodType<unknown> {
  if (!schema || schema.type !== "object") return z.record(z.string(), z.unknown());
  const shape: Record<string, z.ZodType<unknown>> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    let field: z.ZodType<unknown> = z.unknown();
    if (prop.type === "string") field = z.string();
    if (prop.type === "number" || prop.type === "integer") field = z.number();
    if (prop.type === "boolean") field = z.boolean();
    shape[key] = required.has(key) ? field : field.optional();
  }
  return z.object(shape);
}
}

namespace __core_tools_artifactTool {
import CreateArtifactRequestSchema = __ext_1.CreateArtifactRequestSchema;
import CreateArtifactRequest = __ext_1.CreateArtifactRequest;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
import ArtifactManager = __core_core_artifactManager.ArtifactManager;
export function createArtifactTool(manager: ArtifactManager): ToolDefinition<CreateArtifactRequest> {
  return {
    name: "artifact",
    description: "Create a durable artifact for long documents, reports, code, or HTML.",
    runtimeInputSchema: CreateArtifactRequestSchema,
    modelInputSchema: CreateArtifactRequestSchema,
    execute: (input, ctx) => manager.create(withContextConversation(input, ctx.conversationId))
  };
}

function withContextConversation(input: CreateArtifactRequest, conversationId: string | null | undefined): CreateArtifactRequest {
  if (!conversationId || typeof input.metadata?.conversationId === "string") return input;
  return { ...input, metadata: { ...(input.metadata ?? {}), conversationId } };
}
}

namespace __core_tools_codeExecutionTool {
const vm = __default_2;
import z = __ext_2.z;
import CodeExecutionResult = __ext_1.CodeExecutionResult;
import AppEnv = __core_config_env.AppEnv;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
const runtimeInputSchema = z.object({
  language: z.enum(["javascript", "typescript"]),
  code: z.string().min(1)
});

export function createCodeExecutionTool(env: AppEnv): ToolDefinition<z.infer<typeof runtimeInputSchema>, CodeExecutionResult> {
  return {
    name: "local_restricted_runner",
    description: "Run JavaScript or TypeScript in the local restricted runner when explicitly enabled.",
    runtimeInputSchema,
    modelInputSchema: runtimeInputSchema,
    async execute(input) {
      return runLocalRestricted(input, env);
    }
  };
}

export async function runLocalRestricted(
  input: z.infer<typeof runtimeInputSchema>,
  env: Pick<AppEnv, "CODE_EXECUTION_ENABLED" | "CODE_EXECUTION_TIMEOUT_MS">
): Promise<CodeExecutionResult> {
  const start = Date.now();
  if (!env.CODE_EXECUTION_ENABLED) {
    return disabled(start);
  }
  const stdout: string[] = [];
  const stderr: string[] = [];
  try {
    const code = input.language === "typescript" ? stripTypeScript(input.code) : input.code;
    const script = new vm.Script(code, { filename: "local-restricted-runner.js" });
    script.runInNewContext(
      {
        console: {
          log: (...args: unknown[]) => stdout.push(args.map(String).join(" ")),
          error: (...args: unknown[]) => stderr.push(args.map(String).join(" "))
        },
        setTimeout: undefined,
        setInterval: undefined,
        fetch: undefined,
        process: undefined,
        require: undefined,
        import: undefined
      },
      { timeout: env.CODE_EXECUTION_TIMEOUT_MS }
    );
    return result(stdout, stderr, 0, start, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /Script execution timed out/.test(message);
    stderr.push(message);
    return result(stdout, stderr, timedOut ? 124 : 1, start, timedOut);
  }
}

function stripTypeScript(code: string): string {
  return code
    .replace(/^\s*type\s+\w+[^;]*;?/gm, "")
    .replace(/^\s*interface\s+\w+\s*\{[\s\S]*?\}\s*/gm, "")
    .replace(/:\s*[A-Za-z_$][\w$<>,\s\[\]\|&?]*(?=[,)=;])/g, "")
    .replace(/\s+as\s+[A-Za-z_$][\w$<>,\s\[\]\|&?]*/g, "");
}

function disabled(start: number): CodeExecutionResult {
  return result([], ["CODE_EXECUTION_ENABLED=false. Local restricted runner is disabled."], 1, start, false);
}

function result(stdout: string[], stderr: string[], exitCode: number, start: number, timedOut: boolean) {
  return {
    stdout: stdout.join("\n").slice(0, 8000),
    stderr: stderr.join("\n").slice(0, 8000),
    exitCode,
    durationMs: Date.now() - start,
    timedOut
  };
}
}

namespace __core_tools_currentTimeTool {
import z = __ext_2.z;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
const runtimeInputSchema = z.object({
  timeZone: z.string().default("Asia/Shanghai"),
  locale: z.string().default("zh-CN")
});

export function createCurrentTimeTool(): ToolDefinition<z.infer<typeof runtimeInputSchema>> {
  return {
    name: "current_time",
    description: "Get the current date and time for a timezone. Use this for questions about now, today, or Beijing time.",
    runtimeInputSchema,
    modelInputSchema: runtimeInputSchema,
    async execute(input) {
      const now = new Date();
      return {
        iso: now.toISOString(),
        timeZone: input.timeZone,
        locale: input.locale,
        formatted: new Intl.DateTimeFormat(input.locale, {
          timeZone: input.timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).format(now)
      };
    }
  };
}
}

namespace __core_tools_deepSeekOfficialNewsTool {
import z = __ext_2.z;
import AppEnv = __core_config_env.AppEnv;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
const runtimeInputSchema = z.object({
  limit: z.number().int().min(1).max(20).default(8)
});

export interface DeepSeekOfficialNewsItem {
  title: string;
  date: string;
  url: string;
}

export function createDeepSeekOfficialNewsTool(
  env: AppEnv
): ToolDefinition<z.infer<typeof runtimeInputSchema>, { source: string; items: DeepSeekOfficialNewsItem[] }> {
  return {
    name: "deepseek_official_news",
    description: "Fetch official DeepSeek API Docs news list. Use for DeepSeek official news or announcements.",
    runtimeInputSchema,
    modelInputSchema: runtimeInputSchema,
    async execute(input) {
      if (!env.WEB_ACCESS_ENABLED) throw new Error("WEB_ACCESS_ENABLED=false. Web access is disabled.");
      const source = "https://api-docs.deepseek.com/zh-cn/news/news260424";
      const html = await fetchWithTimeout(source, env.WEB_FETCH_TIMEOUT_MS);
      return { source, items: parseDeepSeekOfficialNews(html).slice(0, input.limit) };
    }
  };
}

export function parseDeepSeekOfficialNews(html: string): DeepSeekOfficialNewsItem[] {
  const items: DeepSeekOfficialNewsItem[] = [];
  const pattern = /href="(\/zh-cn\/news\/[^"]+)">([^<]+?)\s+(\d{4}\/\d{2}\/\d{2})<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const path = match[1] ?? "";
    const title = (match[2] ?? "").trim();
    const date = (match[3] ?? "").trim();
    if (!title || !date) continue;
    const url = new URL(path, "https://api-docs.deepseek.com").toString();
    if (!items.some((item) => item.url === url)) items.push({ title, date, url });
  }
  return items;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}
}

namespace __core_tools_fileReaderTool {
import z = __ext_2.z;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
import FileStore = __core_files_fileStore.FileStore;
import WorkspaceFileReader = __core_files_workspaceFileReader.WorkspaceFileReader;
const legacyFileInputSchema = z.object({
  fileId: z.string(),
});

const readInputSchema = z.object({
  operation: z.literal("read"),
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  maxBytes: z.number().int().nonnegative().optional(),
});

const listInputSchema = z.object({
  operation: z.literal("list"),
  path: z.string().optional(),
  recursive: z.boolean().optional(),
  includeDependencies: z.boolean().optional(),
  maxEntries: z.number().int().positive().optional(),
});

const searchInputSchema = z.object({
  operation: z.literal("search"),
  path: z.string().optional(),
  query: z.string(),
  maxResults: z.number().int().positive().optional(),
  maxBytesPerFile: z.number().int().positive().optional(),
  includeDependencies: z.boolean().optional(),
});

const typeInputSchema = z.object({
  operation: z.literal("type"),
  path: z.string(),
});

const runtimeInputSchema = z.union([
  legacyFileInputSchema,
  readInputSchema,
  listInputSchema,
  searchInputSchema,
  typeInputSchema,
]);

const modelInputSchema = z.object({
  fileId: z.string().optional().describe("Uploaded file id for legacy uploaded-file reads."),
  operation: z.enum(["read", "list", "search", "type"]).optional().describe("Workspace operation. Omit this when reading an uploaded file by fileId."),
  path: z.string().optional().describe("Workspace-relative path for read/list/search/type operations."),
  query: z.string().optional().describe("Search query when operation is search."),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  maxBytes: z.number().int().nonnegative().optional(),
  recursive: z.boolean().optional(),
  includeDependencies: z.boolean().optional(),
  maxEntries: z.number().int().positive().optional(),
  maxResults: z.number().int().positive().optional(),
  maxBytesPerFile: z.number().int().positive().optional(),
});

export function createFileReaderTool(
  fileStore: FileStore,
  workspaceReader?: WorkspaceFileReader,
): ToolDefinition<z.infer<typeof runtimeInputSchema>> {
  return {
    name: "file_reader",
    description:
      "Read uploaded files by file id, or safely read, list, search, and type files in the local workspace.",
    runtimeInputSchema,
    modelInputSchema,
    async execute(input, ctx) {
      if ("operation" in input) {
        if (!workspaceReader)
          throw new Error("Workspace file reader is not configured");
        if (input.operation === "read")
          return {
            operation: "read" as const,
            ...(await workspaceReader.read(input)),
          };
        if (input.operation === "list")
          return {
            operation: "list" as const,
            ...(await workspaceReader.list(input)),
          };
        if (input.operation === "search")
          return {
            operation: "search" as const,
            ...(await workspaceReader.search(input)),
          };
        return {
          operation: "type" as const,
          ...(await workspaceReader.type(input)),
        };
      }
      const file = (
        await fileStore.listFiles({ conversationId: ctx.conversationId })
      ).find((item) => item.id === input.fileId);
      if (!file) throw new Error("Uploaded file not found");
      const chunks = await fileStore.listChunks({
        conversationId: ctx.conversationId,
        fileId: input.fileId,
      });
      return { file, chunks };
    },
  };
}
}

namespace __core_tools_longTextTool {
import z = __ext_2.z;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
import createId = __core_utils_id.createId;
const runtimeInputSchema = z.object({
  operation: z.enum(["chunk", "summarize", "topics", "qa", "compress"]),
  text: z.string().min(1),
  question: z.string().optional()
});

export function createLongTextTool(): ToolDefinition<z.infer<typeof runtimeInputSchema>> {
  return {
    name: "long_text",
    description: "Chunk, summarize, extract topics, answer, or compress long text with citations.",
    runtimeInputSchema,
    modelInputSchema: runtimeInputSchema.omit({ text: true }).extend({
      text: z.string().describe("Long text or a prior chunk reference.")
    }),
    async execute(input) {
      const chunks = chunk(input.text);
      if (input.operation === "chunk") return { chunks };
      if (input.operation === "topics") return { topics: extractTopics(input.text), citations: cite(chunks) };
      if (input.operation === "qa") {
        return { answer: answer(input.question ?? "", chunks), citations: cite(chunks) };
      }
      return { summary: summarize(input.text), citations: cite(chunks) };
    }
  };
}

function chunk(text: string) {
  const size = 2200;
  const out = [];
  for (let offset = 0, index = 0; offset < text.length; offset += size, index += 1) {
    const content = text.slice(offset, offset + size);
    out.push({ id: createId("ltchunk"), index, content, tokenEstimate: Math.ceil(content.length / 4) });
  }
  return out;
}

function summarize(text: string): string {
  return `${text.slice(0, 600)}${text.length > 600 ? "..." : ""}`;
}

function extractTopics(text: string): string[] {
  return [...new Set(text.match(/[\p{L}\p{N}_-]{4,}/gu)?.slice(0, 12) ?? ["general"])];
}

function answer(question: string, chunks: ReturnType<typeof chunk>): string {
  const best = chunks.find((item) => item.content.toLowerCase().includes(question.toLowerCase().split(" ")[0] ?? ""));
  return best ? best.content.slice(0, 500) : "No direct answer found in the provided text.";
}

function cite(chunks: ReturnType<typeof chunk>) {
  return chunks.slice(0, 3).map((item) => ({ chunkId: item.id, quote: item.content.slice(0, 120) }));
}
}

namespace __core_tools_memoryTool {
import z = __ext_2.z;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
import MemoryStore = __core_memory_memoryStore.MemoryStore;
const runtimeInputSchema = z.object({
  action: z.enum(["list", "candidates"]),
  query: z.string().optional()
});

export function createMemoryTool(store: MemoryStore): ToolDefinition<z.infer<typeof runtimeInputSchema>> {
  return {
    name: "memory",
    description: "List saved memories or memory candidates. Permanent writes require UI confirmation.",
    runtimeInputSchema,
    modelInputSchema: runtimeInputSchema,
    async execute(input, ctx) {
      const scope = { conversationId: ctx.conversationId ?? null };
      if (input.action === "candidates") return { candidates: await store.listCandidates(scope) };
      const items = await store.list(scope);
      return { items: input.query ? items.filter((item) => item.content.includes(input.query ?? "")) : items };
    }
  };
}
}

namespace __core_methodology_priorityMatrix {

export type PriorityStatus = "main" | "paused";

export interface PriorityItem {
  id: string;
  task: string;
  impact: "high" | "medium" | "low";
  difficulty: "high" | "medium" | "low";
  dependencies: string;
  status: PriorityStatus;
}

export function buildPriorityMatrix(input: string): PriorityItem[] {
  const tasks = extractTasks(input);
  const scored = tasks.map((task, index) => ({
    id: `priority_${index + 1}`,
    task,
    impact: impact(task),
    difficulty: difficulty(task),
    dependencies: dependencyLabel(task),
    score: score(task)
  }));
  const primaryIndex = scored.reduce((best, item, index) => (item.score > scored[best]!.score ? index : best), 0);
  return scored.map((item, index) => ({
    id: item.id,
    task: item.task,
    impact: item.impact,
    difficulty: item.difficulty,
    dependencies: item.dependencies,
    status: index === primaryIndex ? "main" : "paused"
  }));
}

export function selectPrimaryFocus(items: PriorityItem[]): PriorityItem {
  return items.find((item) => item.status === "main") ?? items[0] ?? fallback();
}

function extractTasks(input: string): string[] {
  const lines = input.split(/\r?\n|[。；;]/).map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean);
  const unique = [...new Set(lines)].slice(0, 6);
  return unique.length ? unique : ["明确目标和验收标准"];
}

function impact(task: string): PriorityItem["impact"] {
  if (/(核心|阻塞|认证|支付|安全|数据|用户|关键|架构|主流程)/i.test(task)) return "high";
  if (/(文档|样式|日志|提示|说明)/i.test(task)) return "low";
  return "medium";
}

function difficulty(task: string): PriorityItem["difficulty"] {
  if (/(架构|迁移|重构|并发|安全|复杂|跨模块)/i.test(task)) return "high";
  if (/(文档|复制|提示|配置|小|简单)/i.test(task)) return "low";
  return "medium";
}

function dependencyLabel(task: string): string {
  return /(阻塞|基础|依赖|认证|架构|schema|接口)/i.test(task) ? "blocks downstream work" : "no blocking dependency found";
}

function score(task: string): number {
  const itemImpact = impact(task);
  const itemDifficulty = difficulty(task);
  return (itemImpact === "high" ? 3 : itemImpact === "medium" ? 2 : 1) * 2 - (itemDifficulty === "high" ? 1 : 0);
}

function fallback(): PriorityItem {
  return {
    id: "priority_1",
    task: "明确目标和验收标准",
    impact: "medium",
    difficulty: "low",
    dependencies: "no blocking dependency found",
    status: "main"
  };
}
}

namespace __core_methodology_workflow {

export type WorkflowType = "new_project" | "troubleshooting" | "iteration";
export type PhaseType = "explore" | "focus" | "expand";

export interface MethodologyLabel<T extends string> {
  type: T;
  label: string;
  reason: string;
}

const workflows: Record<WorkflowType, Omit<MethodologyLabel<WorkflowType>, "type">> = {
  new_project: { label: "新项目启动", reason: "任务要求从零搭建、bootstrap 或创建新能力。" },
  troubleshooting: { label: "疑难攻坚", reason: "任务包含失败、阻塞、根因不明或需要集中解决的问题。" },
  iteration: { label: "迭代优化", reason: "任务围绕已有方案、反馈、改进或优化展开。" }
};

const phases: Record<PhaseType, Omit<MethodologyLabel<PhaseType>, "type">> = {
  explore: { label: "探索积累", reason: "事实不足，需要先调查、收集证据并建立初步判断。" },
  focus: { label: "攻坚推进", reason: "已有基础但存在关键阻塞，需要锁定主攻目标。" },
  expand: { label: "全面展开", reason: "核心路径稳定，可以扩大覆盖范围或推广成果。" }
};

export function classifyWorkflow(text: string): MethodologyLabel<WorkflowType> {
  if (/(迭代|优化|反馈|改进|已有|现有|review|polish|refine)/i.test(text)) return label("iteration");
  if (/(bug|失败|报错|阻塞|根因|疑难|反复|修复|broken|fail|debug)/i.test(text)) return label("troubleshooting");
  return label(/(新|从零|创建|搭建|bootstrap|scaffold|start)/i.test(text) ? "new_project" : "troubleshooting");
}

export function inferPhase(text: string): MethodologyLabel<PhaseType> {
  if (/(推广|全面|稳定|成熟|覆盖所有|上线|rollout|scale)/i.test(text)) return phase("expand");
  if (/(阻塞|关键|主攻|已有基础|攻坚|瓶颈|核心)/i.test(text)) return phase("focus");
  return phase("explore");
}

function label(type: WorkflowType): MethodologyLabel<WorkflowType> {
  return { type, ...workflows[type] };
}

function phase(type: PhaseType): MethodologyLabel<PhaseType> {
  return { type, ...phases[type] };
}
}

namespace __core_methodology_planContent {
import buildPriorityMatrix = __core_methodology_priorityMatrix.buildPriorityMatrix;
import selectPrimaryFocus = __core_methodology_priorityMatrix.selectPrimaryFocus;
import PriorityItem = __core_methodology_priorityMatrix.PriorityItem;
import classifyWorkflow = __core_methodology_workflow.classifyWorkflow;
import inferPhase = __core_methodology_workflow.inferPhase;
import MethodologyLabel = __core_methodology_workflow.MethodologyLabel;
import PhaseType = __core_methodology_workflow.PhaseType;
import WorkflowType = __core_methodology_workflow.WorkflowType;
export interface PlanMethodologyMetadata {
  workflow: MethodologyLabel<WorkflowType>;
  phase: MethodologyLabel<PhaseType>;
  primaryFocus: string;
  priorityMatrix: PriorityItem[];
  multiAngleSteps: string[];
  bootstrapAssessment?: string[] | undefined;
}

export function buildPlanMethodology(prompt: string): PlanMethodologyMetadata {
  const workflow = classifyWorkflow(prompt);
  const phase = inferPhase(prompt);
  const priorityMatrix = buildPriorityMatrix(prompt);
  const primaryFocus = selectPrimaryFocus(priorityMatrix).task;
  return {
    workflow,
    phase,
    primaryFocus,
    priorityMatrix,
    multiAngleSteps: workflow.type === "new_project" ? ["矛盾分析", "方案设计"] : ["调查研究", "方案验证"],
    bootstrapAssessment: workflow.type === "new_project" ? bootstrapAssessment(prompt) : undefined
  };
}

export function renderPlanContent(title: string, prompt: string, metadata: PlanMethodologyMetadata): string {
  return [
    `# ${title}`,
    "",
    "## 方法标记",
    `计划类型：${metadata.workflow.label}`,
    `当前阶段：${metadata.phase.label}`,
    `主攻目标：${metadata.primaryFocus}`,
    `多角度步骤：${metadata.multiAngleSteps.join("、")}`,
    "多角度启用：否",
    "",
    "## 优先级矩阵",
    "| 状态 | 任务 | 影响 | 难度 | 依赖 |",
    "| --- | --- | --- | --- | --- |",
    ...metadata.priorityMatrix.map((item) =>
      `| ${item.status === "main" ? "🎯 主攻" : "⏸ 暂缓"} | ${item.task} | ${item.impact} | ${item.difficulty} | ${item.dependencies} |`
    ),
    "",
    "## 执行计划",
    ...steps(metadata),
    "",
    "## User Request",
    prompt
  ].join("\n");
}

export function parsePlanMethodology(content: string): Pick<PlanMethodologyMetadata, "multiAngleSteps" | "primaryFocus"> {
  const primaryFocus = content.match(/^主攻目标：(.+)$/m)?.[1]?.trim() || "明确目标和验收标准";
  const enabled = content.match(/^多角度启用：(.+)$/m)?.[1]?.trim() === "是";
  const multiAngleSteps = (content.match(/^多角度步骤：(.+)$/m)?.[1] ?? "")
    .split(/[、,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return { primaryFocus, multiAngleSteps: enabled ? multiAngleSteps : [] };
}

function steps(metadata: PlanMethodologyMetadata): string[] {
  const bootstrap = metadata.bootstrapAssessment?.length
    ? ["1. 调查约束和可用资源", `2. 🧩 Bootstrap 评估：${metadata.bootstrapAssessment.join("；")}`, "3. 锁定主攻目标并验证"]
    : ["1. 调查事实和约束", "2. 🧩 分析关键取舍", "3. 执行主攻目标", "4. 验证结果并复盘"];
  return bootstrap;
}

function bootstrapAssessment(prompt: string): string[] {
  return [
    `最小立足点：${prompt.slice(0, 36) || "先建立可验证样例"}`,
    "避免分散推进，先做一个可验证闭环",
    "完成后再扩展到完整范围"
  ];
}
}

namespace __core_methodology_multiPassCoordinator {

export type CoordinatorRole = "Investigator" | "ContradictionMapper" | "Specialist" | "Verifier" | "FeedbackSynthesizer";

export interface CoordinatorEvent {
  role: CoordinatorRole;
  summary: string;
}

export interface CoordinatorResult {
  summary: string;
  events: CoordinatorEvent[];
}

export class MultiPassCoordinator {
  async run(input: { goal: string; context?: string | undefined }): Promise<CoordinatorResult> {
    const goal = input.goal.trim() || "未命名任务";
    const events: CoordinatorEvent[] = [
      { role: "Investigator", summary: `依据目标收集事实：${goal.slice(0, 80)}` },
      { role: "ContradictionMapper", summary: "识别主要取舍：速度、质量、风险和验证成本。" },
      { role: "Specialist", summary: "给出专项实现路径，并标记需要验证的假设。" },
      { role: "Verifier", summary: "检查输出是否有事实依据、可运行验证和失败处理。" },
      { role: "FeedbackSynthesizer", summary: "综合一致意见、分歧和缺口，形成最终建议。" }
    ];
    return {
      events,
      summary: [
        "## 综合结论",
        `目标：${goal}`,
        "",
        "- 先完成事实调查和关键约束确认。",
        "- 主攻影响最大且阻塞后续工作的事项。",
        "- 每个完成声明必须附验证证据。",
        input.context ? `- 已纳入上下文：${input.context.slice(0, 120)}` : ""
      ].filter(Boolean).join("\n")
    };
  }
}
}

namespace __core_tools_methodologyTools {
import z = __ext_2.z;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
import buildPlanMethodology = __core_methodology_planContent.buildPlanMethodology;
import buildPriorityMatrix = __core_methodology_priorityMatrix.buildPriorityMatrix;
import MultiPassCoordinator = __core_methodology_multiPassCoordinator.MultiPassCoordinator;
const textSchema = z.object({ text: z.string().min(1) });
const feedbackSchema = z.object({ sources: z.array(z.string()).min(1) });

export function createInvestigationTool(): ToolDefinition<z.infer<typeof textSchema>> {
  return {
    name: "investigation_report",
    description: "Create a structured investigation report from the provided task text.",
    runtimeInputSchema: textSchema,
    modelInputSchema: textSchema,
    async execute(input) {
      return { report: ["Facts checked", input.text, "Open questions recorded"].join("\n") };
    }
  };
}

export function createPriorityMatrixTool(): ToolDefinition<z.infer<typeof textSchema>> {
  return {
    name: "priority_matrix",
    description: "Build a priority matrix and select one primary focus.",
    runtimeInputSchema: textSchema,
    modelInputSchema: textSchema,
    async execute(input) {
      return { items: buildPriorityMatrix(input.text) };
    }
  };
}

export function createBootstrapAssessmentTool(): ToolDefinition<z.infer<typeof textSchema>> {
  return {
    name: "bootstrap_assessment",
    description: "Assess a new project starting point and minimum viable foothold.",
    runtimeInputSchema: textSchema,
    modelInputSchema: textSchema,
    async execute(input) {
      return { methodology: buildPlanMethodology(input.text) };
    }
  };
}

export function createFeedbackSynthesisTool(): ToolDefinition<z.infer<typeof feedbackSchema>> {
  return {
    name: "feedback_synthesis",
    description: "Synthesize multiple feedback sources into agreements, conflicts, and gaps.",
    runtimeInputSchema: feedbackSchema,
    modelInputSchema: feedbackSchema,
    async execute(input) {
      const result = await new MultiPassCoordinator().run({ goal: input.sources.join("\n") });
      return { summary: result.summary, sourceCount: input.sources.length };
    }
  };
}
}

namespace __core_tools_obsidianExportTool {
import z = __ext_2.z;
import ToolDefinition = __core_core_toolRouter.ToolDefinition;
import ObsidianExportInput = __core_obsidian_obsidianVaultBridge.ObsidianExportInput;
import ObsidianExportResult = __core_obsidian_obsidianVaultBridge.ObsidianExportResult;
const inputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  links: z.array(z.string()).default([])
});

export interface ObsidianExportBridge {
  exportMarkdown(input: ObsidianExportInput): Promise<ObsidianExportResult>;
}

export function createObsidianExportTool(bridge: ObsidianExportBridge): ToolDefinition<z.infer<typeof inputSchema>, unknown> {
  return {
    name: "obsidian_export_note",
    description: "Export a durable answer, canvas, plan, or research result as a Markdown note in the configured Obsidian vault.",
    runtimeInputSchema: inputSchema,
    modelInputSchema: inputSchema,
    async execute(input, ctx) {
      return await bridge.exportMarkdown({
        title: input.title,
        content: input.content,
        tags: input.tags,
        links: input.links,
        source: { type: "tool_request", id: ctx.requestId }
      });
    }
  };
}
}

namespace __core_runtime_toolFactory {
import AppEnv = __core_config_env.AppEnv;
import ArtifactManager = __core_core_artifactManager.ArtifactManager;
import ToolRouter = __core_core_toolRouter.ToolRouter;
import FileStore = __core_files_fileStore.FileStore;
import WorkspaceFileReader = __core_files_workspaceFileReader.WorkspaceFileReader;
import MemoryStore = __core_memory_memoryStore.MemoryStore;
import ObsidianExportInput = __core_obsidian_obsidianVaultBridge.ObsidianExportInput;
import ObsidianExportResult = __core_obsidian_obsidianVaultBridge.ObsidianExportResult;
import ObsidianVaultBridgeOptions = __core_obsidian_obsidianVaultBridge.ObsidianVaultBridgeOptions;
import PluginManager = __core_plugins_pluginManager.PluginManager;
import createArtifactTool = __core_tools_artifactTool.createArtifactTool;
import createCodeExecutionTool = __core_tools_codeExecutionTool.createCodeExecutionTool;
import createCurrentTimeTool = __core_tools_currentTimeTool.createCurrentTimeTool;
import createDeepSeekOfficialNewsTool = __core_tools_deepSeekOfficialNewsTool.createDeepSeekOfficialNewsTool;
import createFileReaderTool = __core_tools_fileReaderTool.createFileReaderTool;
import createLongTextTool = __core_tools_longTextTool.createLongTextTool;
import createMemoryTool = __core_tools_memoryTool.createMemoryTool;
import createBootstrapAssessmentTool = __core_tools_methodologyTools.createBootstrapAssessmentTool;
import createFeedbackSynthesisTool = __core_tools_methodologyTools.createFeedbackSynthesisTool;
import createInvestigationTool = __core_tools_methodologyTools.createInvestigationTool;
import createPriorityMatrixTool = __core_tools_methodologyTools.createPriorityMatrixTool;
import createObsidianExportTool = __core_tools_obsidianExportTool.createObsidianExportTool;
import createWebFetchTool = __core_tools_webFetchTool.createWebFetchTool;
import createWebSearchTool = __core_tools_webFetchTool.createWebSearchTool;
interface RuntimeToolDeps {
  env: AppEnv;
  fileStore: FileStore;
  workspaceFileReader: WorkspaceFileReader;
  artifactManager: ArtifactManager;
  memoryStore: MemoryStore;
}

export function createRuntimeTools({ env, fileStore, workspaceFileReader, artifactManager, memoryStore }: RuntimeToolDeps) {
  const toolRouter = new ToolRouter();
  toolRouter.register(createFileReaderTool(fileStore, workspaceFileReader));
  toolRouter.register(createLongTextTool());
  toolRouter.register(createCurrentTimeTool());
  toolRouter.register(createDeepSeekOfficialNewsTool(env));
  toolRouter.register(createWebFetchTool(env));
  toolRouter.register(createWebSearchTool(env));
  toolRouter.register(createCodeExecutionTool(env));
  toolRouter.register(createArtifactTool(artifactManager));
  toolRouter.register(createMemoryTool(memoryStore));
  toolRouter.register(createInvestigationTool());
  toolRouter.register(createPriorityMatrixTool());
  toolRouter.register(createBootstrapAssessmentTool());
  toolRouter.register(createFeedbackSynthesisTool());
  const pluginManager = env.WORKBENCH_PLUGIN_DIR
    ? new PluginManager({ pluginRoot: env.WORKBENCH_PLUGIN_DIR, toolRouter })
    : undefined;
  const pluginLoadPromise = pluginManager?.loadAll().catch((error) => {
    console.warn(`[plugins] load failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  });
  const obsidianBridge = env.OBSIDIAN_VAULT_PATH
    ? createLazyObsidianBridge({ vaultPath: env.OBSIDIAN_VAULT_PATH, folder: env.OBSIDIAN_EXPORT_FOLDER })
    : undefined;
  if (obsidianBridge) toolRouter.register(createObsidianExportTool(obsidianBridge));
  return { toolRouter, pluginManager, pluginLoadPromise, obsidianBridge };
}

function createLazyObsidianBridge(options: ObsidianVaultBridgeOptions): { exportMarkdown(input: ObsidianExportInput): Promise<ObsidianExportResult> } {
  let bridge: Promise<{ exportMarkdown(input: ObsidianExportInput): Promise<ObsidianExportResult> }> | undefined;
  return {
    async exportMarkdown(input) {
      // 保持桥接器懒加载，避免构建时静态追踪用户本地 Obsidian 路径。
      bridge ??= Promise.resolve(__core_obsidian_obsidianVaultBridge).then(({ ObsidianVaultBridge }) => new ObsidianVaultBridge(options));
      return (await bridge).exportMarkdown(input);
    }
  };
}
}

namespace __core_storage_conversationWorkspaceMigration {
import existsSync = __ext_5.existsSync;
import mkdirSync = __ext_5.mkdirSync;
import writeFileSync = __ext_5.writeFileSync;
import mkdir = __ext_9.mkdir;
import dirname = __ext_8.dirname;
import join = __ext_8.join;
import AiTask = __ext_1.AiTask;
import AiTaskEvent = __ext_1.AiTaskEvent;
import Artifact = __ext_1.Artifact;
import ContextBlock = __ext_1.ContextBlock;
import CreateConversationRequest = __ext_1.CreateConversationRequest;
import nowIso = __core_utils_id.nowIso;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
const storageVersionFile = "storage-version.json";

export async function migrateLegacyConversationWorkspace({
  workspace,
  database,
  legacyDatabase,
  legacyStorage
}: {
  workspace: ConversationWorkspaceStore;
  database: ConversationWorkspaceDatabase;
  legacyDatabase: WorkbenchDatabase;
  legacyStorage: StorageAdapter;
}): Promise<void> {
  if (hasLegacyMigrationMarker(workspace)) return;

  const backupDir = join(workspace.rootPath(), "migration-backups", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(backupDir, { recursive: true });
  writeFileSyncUtf8(join(backupDir, "README.txt"), "Legacy data migration backup marker.\n");

  const legacyTasks = await readLegacyJson<AiTask[]>(legacyStorage, "tasks/tasks.json", []);
  const legacyEvents = await readLegacyJson<AiTaskEvent[]>(legacyStorage, "tasks/events.json", []);
  const legacyArtifacts = await readLegacyJson<Artifact[]>(legacyStorage, "artifacts/artifacts.json", []);
  const legacyArtifactRevisions = await readLegacyJson<Array<Record<string, unknown>>>(legacyStorage, "artifacts/revisions.json", []);
  const legacyCanvasRevisions = await readLegacyJson<Array<Record<string, unknown>>>(legacyStorage, "canvas-revisions.json", []);
  const legacyContextBlocks = await readLegacyJson<ContextBlock[]>(legacyStorage, "context/blocks.json", []);
  const conversationIds = new Set<string>(legacyDatabase.listConversations().map((conversation) => conversation.id));
  for (const task of legacyTasks) if (task.conversationId) conversationIds.add(task.conversationId);
  for (const artifact of legacyArtifacts) {
    const conversationId = metadataString(artifact.metadata, "conversationId");
    if (conversationId) conversationIds.add(conversationId);
  }
  for (const block of legacyContextBlocks) if (block.conversationId) conversationIds.add(block.conversationId);

  for (const conversationId of conversationIds) {
    const conversation = legacyDatabase.getConversation(conversationId);
    workspace.ensureConversation(conversationId, { title: conversation?.title ?? "Migrated conversation" });
    const targetDb = database.dbForConversation(conversationId);
    migrateSqliteConversation(legacyDatabase, targetDb, conversationId);

    const taskIds = new Set(legacyTasks.filter((task) => task.conversationId === conversationId).map((task) => task.id));
    const artifactIds = new Set(legacyArtifacts.filter((artifact) => metadataString(artifact.metadata, "conversationId") === conversationId).map((artifact) => artifact.id));
    const canvasIds = new Set(targetDb.listCanvases(conversationId).map((canvas) => canvas.id));
    const storage = workspace.storageForConversation(conversationId);
    await mergeIfAny(storage, "tasks.json", legacyTasks.filter((task) => task.conversationId === conversationId));
    await mergeIfAny(storage, "task-events.json", legacyEvents.filter((event) => taskIds.has(event.taskId)));
    await mergeIfAny(storage, "artifacts.json", legacyArtifacts.filter((artifact) => metadataString(artifact.metadata, "conversationId") === conversationId));
    await mergeIfAny(storage, "artifact-revisions.json", legacyArtifactRevisions.filter((revision) => artifactIds.has(stringField(revision, "artifactId"))));
    await mergeIfAny(storage, "canvas-revisions.json", legacyCanvasRevisions.filter((revision) => canvasIds.has(stringField(revision, "canvasId"))));
    await mergeIfAny(storage, "context/blocks.json", legacyContextBlocks.filter((block) => block.conversationId === conversationId));
  }

  writeStorageVersionMarker(workspace);
}

async function readLegacyJson<T>(storage: StorageAdapter, key: string, fallback: T): Promise<T> {
  const stored = await storage.readJson<T>(key, fallback);
  if (!stored.ok) throw new Error(stored.error.message);
  return stored.value;
}

function metadataString(metadata: Artifact["metadata"], key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function writeFileSyncUtf8(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

type SqlRow = Record<string, string | number | null>;

function migrateSqliteConversation(source: WorkbenchDatabase, target: WorkbenchDatabase, conversationId: string): void {
  const conversationRows = rows(source, "SELECT * FROM conversations WHERE id = ?", [conversationId]);
  insertRows(target, "conversations", conversationRows);
  if (!conversationRows.length && !target.getConversation(conversationId)) {
    target.createConversation({ id: conversationId, title: "Migrated conversation" } as CreateConversationRequest & { id: string });
  }
  const planIds = ids(rows(source, "SELECT id FROM plans WHERE conversation_id IS ?", [conversationId]));
  const canvasIds = ids(rows(source, "SELECT id FROM canvases WHERE conversation_id IS ?", [conversationId]));
  const projectIds = ids(rows(source, "SELECT id FROM canvas_projects WHERE conversation_id IS ?", [conversationId]));

  insertRows(target, "messages", rows(source, "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC", [conversationId]));
  insertRows(target, "plans", rows(source, "SELECT * FROM plans WHERE conversation_id IS ?", [conversationId]));
  insertRows(target, "plan_steps", rowsByIds(source, "plan_steps", "plan_id", planIds));
  insertRows(target, "canvases", rows(source, "SELECT * FROM canvases WHERE conversation_id IS ?", [conversationId]));

  const assetHashes = new Set<string>();
  for (const row of rowsByIds(source, "canvas_files", "project_id", projectIds)) addString(assetHashes, row.content_hash);
  for (const row of rowsByIds(source, "canvas_assets", "project_id", projectIds)) addString(assetHashes, row.asset_hash);
  for (const row of rowsByIds(source, "canvas_outputs", "project_id", projectIds)) addString(assetHashes, row.asset_hash);
  insertRows(target, "asset_blobs", rowsByIds(source, "asset_blobs", "hash", [...assetHashes]));

  insertRows(target, "canvas_projects", rows(source, "SELECT * FROM canvas_projects WHERE conversation_id IS ?", [conversationId]));
  for (const table of ["canvas_nodes", "canvas_files", "canvas_versions", "canvas_assets", "render_jobs", "export_jobs", "canvas_outputs", "review_reports"]) {
    insertRows(target, table, rowsByIds(source, table, "project_id", projectIds));
  }
  for (const table of ["methodology_states", "evidence_items", "contradiction_items", "focus_locks", "validation_cycles", "feedback_syntheses"]) {
    insertRows(target, table, [
      ...rows(source, `SELECT * FROM ${table} WHERE conversation_id IS ?`, [conversationId]),
      ...rowsByIds(source, table, "project_id", projectIds)
    ]);
  }
  insertRows(target, "cards", rows(source, "SELECT * FROM cards WHERE (type = 'chat' AND source_id = ?) OR (type = 'plan' AND source_id IN (SELECT id FROM plans WHERE conversation_id IS ?)) OR (type = 'canvas' AND source_id IN (SELECT id FROM canvases WHERE conversation_id IS ?))", [conversationId, conversationId, conversationId]));
}

function rows(db: WorkbenchDatabase, sql: string, params: Array<string | number | null> = []): SqlRow[] {
  return db.prepare(sql).all(...params) as SqlRow[];
}

function rowsByIds(db: WorkbenchDatabase, table: string, column: string, values: string[]): SqlRow[] {
  if (!values.length) return [];
  const placeholders = values.map(() => "?").join(", ");
  return rows(db, `SELECT * FROM ${table} WHERE ${column} IN (${placeholders})`, values);
}

function insertRows(db: WorkbenchDatabase, table: string, sourceRows: SqlRow[]): void {
  if (!sourceRows.length) return;
  const columns = tableColumns(db, table).filter((column) => Object.prototype.hasOwnProperty.call(sourceRows[0], column));
  if (!columns.length) return;
  const placeholders = columns.map(() => "?").join(", ");
  const statement = db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
  db.exec("BEGIN");
  try {
    for (const row of sourceRows) statement.run(...columns.map((column) => row[column] ?? null));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function tableColumns(db: WorkbenchDatabase, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name);
}

function ids(rowsToRead: SqlRow[]): string[] {
  return rowsToRead.flatMap((row) => (typeof row.id === "string" ? [row.id] : []));
}

function addString(target: Set<string>, value: unknown): void {
  if (typeof value === "string" && value.trim()) target.add(value);
}

async function mergeIfAny<T extends Record<string, unknown>>(storage: StorageAdapter, key: string, incoming: T[]): Promise<void> {
  if (!incoming.length) return;
  const stored = await storage.readJson<T[]>(key, []);
  if (!stored.ok) throw new Error(stored.error.message);
  const byId = new Map<string, T>();
  for (const item of stored.value) {
    const id = stringField(item, "id");
    if (id) byId.set(id, item);
  }
  for (const item of incoming) {
    const id = stringField(item, "id");
    if (id && !byId.has(id)) byId.set(id, item);
  }
  const written = await storage.writeJsonAtomic(key, [...byId.values()]);
  if (!written.ok) throw new Error(written.error.message);
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function hasLegacyMigrationMarker(workspace: ConversationWorkspaceStore): boolean {
  return existsSync(join(workspace.rootPath(), storageVersionFile));
}

function writeStorageVersionMarker(workspace: ConversationWorkspaceStore): void {
  writeFileSyncUtf8(join(workspace.rootPath(), storageVersionFile), JSON.stringify({
    version: 1,
    legacyMigration: {
      completed: true,
      completedAt: nowIso()
    }
  }, null, 2));
}
}

namespace __core_runtime_storageFactory {
import existsSync = __ext_5.existsSync;
import dirname = __ext_8.dirname;
import isAbsolute = __ext_8.isAbsolute;
import join = __ext_8.join;
import relative = __ext_8.relative;
import AppEnv = __core_config_env.AppEnv;
import LocalJsonStorageAdapter = __core_storage_localJsonStorageAdapter.LocalJsonStorageAdapter;
import migrateLegacyConversationWorkspace = __core_storage_conversationWorkspaceMigration.migrateLegacyConversationWorkspace;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
import resolveWorkspaceDataDir = __core_storage_conversationWorkspaceStore.resolveWorkspaceDataDir;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
export function createRuntimeStorage(env: Pick<AppEnv, "WORKBENCH_DATA_DIR">) {
  const workspace = new ConversationWorkspaceStore(env.WORKBENCH_DATA_DIR ?? resolveWorkspaceDataDir());
  const storage = new LocalJsonStorageAdapter(join(workspace.rootPath(), "global"));
  const database = new ConversationWorkspaceDatabase(workspace);
  const legacyMigrationPromise = migrateLegacyDataIfPresent(workspace, database);
  return { workspace, storage, database, legacyMigrationPromise };
}

async function migrateLegacyDataIfPresent(workspace: ConversationWorkspaceStore, database: ConversationWorkspaceDatabase): Promise<void> {
  const legacyDbPath = process.env.WORKBENCH_DB_PATH?.trim();
  if (!legacyDbPath || !existsSync(legacyDbPath)) return;
  const relativeLegacyPath = relative(workspace.rootPath(), legacyDbPath);
  if (relativeLegacyPath === "" || (!relativeLegacyPath.startsWith("..") && !isAbsolute(relativeLegacyPath))) return;
  const legacyDatabase = new WorkbenchDatabase(legacyDbPath);
  try {
    await migrateLegacyConversationWorkspace({
      workspace,
      database,
      legacyDatabase,
      legacyStorage: new LocalJsonStorageAdapter(join(dirname(legacyDbPath), ".data"))
    });
  } finally {
    legacyDatabase.close();
  }
}
}

namespace __core_research_types {
import z = __ext_2.z;
const MetadataSchema = z.record(z.string(), z.unknown());

export const ResearchSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  snippet: z.string().optional(),
  source: z.string().optional(),
  metadata: MetadataSchema.optional()
});

export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const ResearchMaterialSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  url: z.string().optional(),
  source: z.string().optional(),
  content: z.string(),
  kind: z.string().min(1).optional(),
  metadata: MetadataSchema.optional()
});

export type ResearchMaterial = z.infer<typeof ResearchMaterialSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  materialId: z.string().min(1),
  quote: z.string().optional(),
  note: z.string().min(1),
  url: z.string().optional()
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  confidence: z.enum(["low", "medium", "high"])
});

export type Finding = z.infer<typeof FindingSchema>;

export const ContradictionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sideA: z.string().min(1),
  sideB: z.string().min(1),
  nature: z.enum(["technical", "resource", "scope", "unknown"]),
  priority: z.enum(["principal", "secondary"]),
  dominantSide: z.enum(["A", "B", "balanced"]).optional(),
  rationale: z.string().min(1),
  evidenceIds: z.array(z.string().min(1))
});

export type Contradiction = z.infer<typeof ContradictionSchema>;

export const ResearchPlanStepSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1),
  objective: z.string().min(1),
  output: z.string().min(1)
});

export type ResearchPlanStep = z.infer<typeof ResearchPlanStepSchema>;

export const ResearchPlanSchema = z.object({
  question: z.string().min(1),
  mode: z.enum(["quick", "standard", "deep"]),
  steps: z.array(ResearchPlanStepSchema),
  keyResources: z.array(z.string()),
  breakthrough: z.string(),
  longTermRoute: z.array(z.string())
});

export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

export const CritiqueIssueSchema = z.object({
  severity: z.enum(["must-fix", "should-fix", "improve"]),
  issue: z.string().min(1),
  recommendation: z.string().min(1),
  evidenceIds: z.array(z.string()).optional()
});

export type CritiqueIssue = z.infer<typeof CritiqueIssueSchema>;

export const CritiqueResultSchema = z.object({
  summary: z.string().min(1),
  issues: z.array(CritiqueIssueSchema),
  selfCritique: z.array(z.string()),
  missingEvidence: z.array(z.string())
});

export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;

export const ResearchSynthesisResultSchema = z.object({
  question: z.string().min(1),
  summary: z.string().min(1),
  investigationSummary: z.string().min(1),
  findings: z.array(FindingSchema),
  contradictions: z.array(ContradictionSchema),
  unknowns: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
  plan: ResearchPlanSchema,
  keyResources: z.array(z.string()),
  breakthrough: z.string(),
  longTermRoute: z.array(z.string()),
  feedbackSynthesis: z.string(),
  critique: CritiqueResultSchema,
  nextActions: z.array(z.string())
});

export type ResearchSynthesisResult = z.infer<typeof ResearchSynthesisResultSchema>;

export interface ResearchSourceProvider {
  readonly id: string;
  collect(query: string, options?: Record<string, unknown>): Promise<ResearchMaterial[]>;
}

export interface SearchResultLike {
  title: string;
  url: string;
  snippet?: string | undefined;
  source?: string | undefined;
}

export interface PageContentLike {
  url: string;
  finalUrl?: string | undefined;
  title?: string | undefined;
  content: string;
  format?: string | undefined;
  truncated?: boolean | undefined;
  fetchedAt?: string | undefined;
  source?: string | undefined;
}

export interface SearchAndFetchResponseLike {
  search?: {
    query?: string | undefined;
    results?: SearchResultLike[] | undefined;
    providerId?: string | null | undefined;
    attemptedProviders?: string[] | undefined;
  } | undefined;
  pages?: Array<PageContentLike | { url: string; error: string; source?: string | undefined }> | undefined;
}

export interface SynthesisOptions {
  question?: string | undefined;
  constraints?: string[] | undefined;
}
}

namespace __core_research_sourceProvider {
import PageContentLike = __core_research_types.PageContentLike;
import ResearchMaterial = __core_research_types.ResearchMaterial;
import ResearchSource = __core_research_types.ResearchSource;
import ResearchSourceProvider = __core_research_types.ResearchSourceProvider;
import SearchAndFetchResponseLike = __core_research_types.SearchAndFetchResponseLike;
import SearchResultLike = __core_research_types.SearchResultLike;
const LEGACY_HOME_PREFIX = ["/home", "zephyr"].join("/");
const LEGACY_WEB_STAGE = [String(4).padStart(2, "0"), "web", "search", "tool"].join("-");
const LEGACY_RESEARCH_STAGE = String(5).padStart(2, "0");

export function sanitizeLegacyStageText(value: string): string {
  return value
    .replace(new RegExp(`${escapeRegExp(LEGACY_HOME_PREFIX)}[^\\s)\\]]*`, "gi"), "[legacy path redacted]")
    .replace(new RegExp(escapeRegExp(LEGACY_WEB_STAGE), "gi"), "web search provider")
    .replace(new RegExp(`(^|[\\s/\\\\])${LEGACY_RESEARCH_STAGE}(?:-[A-Za-z0-9_-]+)?(?=$|[\\s/\\\\.,:;)\\]])`, "g"), "$1research module");
}

export function stableMaterialId(prefix: string, index: number, value: string): string {
  const normalized = sanitizeLegacyStageText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${prefix}-${index + 1}${normalized ? `-${normalized}` : ""}`;
}

export function sanitizeResearchSource(source: ResearchSource, metadata: Record<string, unknown> = {}): ResearchSource {
  const snippet = source.snippet ? sanitizeLegacyStageText(source.snippet) : undefined;
  const nextMetadata = { ...(source.metadata ?? {}), ...metadata };
  return {
    title: sanitizeLegacyStageText(source.title),
    url: sanitizeLegacyStageText(source.url),
    ...(snippet ? { snippet } : {}),
    ...(source.source ? { source: sanitizeLegacyStageText(source.source) } : {}),
    ...(Object.keys(nextMetadata).length ? { metadata: nextMetadata } : {})
  };
}

export function searchResultsToMaterials(results: SearchResultLike[], source = "web-search.search"): ResearchMaterial[] {
  return results.map((result, index) => {
    const safeTitle = sanitizeLegacyStageText(result.title);
    const safeUrl = sanitizeLegacyStageText(result.url);
    const safeSnippet = result.snippet ? sanitizeLegacyStageText(result.snippet) : "";
    return {
      id: stableMaterialId("search", index, result.url),
      title: safeTitle,
      url: safeUrl,
      source: sanitizeLegacyStageText(result.source ?? source),
      kind: "search-result",
      content: [safeTitle, safeSnippet, safeUrl].filter(Boolean).join("\n"),
      metadata: { adapter: "SearchResultLike", rank: index + 1 }
    };
  });
}

export function pageContentsToMaterials(pages: PageContentLike[], source = "web-search.fetch"): ResearchMaterial[] {
  return pages.map((page, index) => {
    const url = page.finalUrl ?? page.url;
    const material: ResearchMaterial = {
      id: stableMaterialId("page", index, url),
      title: sanitizeLegacyStageText(page.title ?? url),
      url: sanitizeLegacyStageText(url),
      source: sanitizeLegacyStageText(page.source ?? source),
      kind: "page",
      content: sanitizeLegacyStageText(page.content),
      metadata: {
        adapter: "PageContentLike",
        fetchStatus: "fetched",
        ...(page.format ? { format: page.format } : {}),
        ...(typeof page.truncated === "boolean" ? { truncated: page.truncated } : {}),
        ...(page.fetchedAt ? { fetchedAt: page.fetchedAt } : {})
      }
    };
    return material;
  });
}

export function fetchedTextToMaterial(source: ResearchSource, text: string, index: number): ResearchMaterial {
  const safeSource = sanitizeResearchSource(source);
  return pageContentsToMaterials(
    [
      {
        url: safeSource.url,
        title: safeSource.title,
        content: text,
        format: "text",
        truncated: text.length > 3000,
        source: "web-search.fetch"
      }
    ],
    "web-search.fetch"
  ).map((material) => ({ ...material, id: stableMaterialId("page", index, safeSource.url) }))[0] as ResearchMaterial;
}

export function fetchFallbackToMaterial(source: ResearchSource, index: number, error: unknown): ResearchMaterial {
  const safeSource = sanitizeResearchSource(source);
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: stableMaterialId("fallback", index, safeSource.url),
    title: safeSource.title,
    url: safeSource.url,
    source: "web-search.fetch",
    kind: "page",
    content: `Fetch fallback: ${safeSource.snippet ?? "No snippet was available."}`,
    metadata: {
      adapter: "fetchText",
      fetchStatus: "failed",
      error: sanitizeLegacyStageText(message)
    }
  };
}

export function searchAndFetchResponseToMaterials(response: SearchAndFetchResponseLike): ResearchMaterial[] {
  const materials: ResearchMaterial[] = [];
  if (Array.isArray(response.search?.results)) {
    materials.push(...searchResultsToMaterials(response.search.results, response.search.providerId ?? "web-search.search"));
  }
  if (Array.isArray(response.pages)) {
    materials.push(...pageContentsToMaterials(response.pages.filter(isPageContentLike)));
  }
  return materials;
}

export function externalMaterialsToResearchMaterials(input: unknown, source = "external"): ResearchMaterial[] {
  if (Array.isArray(input)) {
    if (input.every(isSearchResultLike)) return searchResultsToMaterials(input, source);
    if (input.every(isPageContentLike)) return pageContentsToMaterials(input, source);
    return input.filter(isResearchMaterial).map(sanitizeResearchMaterial);
  }
  if (input && typeof input === "object" && ("search" in input || "pages" in input)) {
    return searchAndFetchResponseToMaterials(input as SearchAndFetchResponseLike);
  }
  return [];
}

export class StaticResearchSourceProvider implements ResearchSourceProvider {
  readonly id: string;
  private readonly materials: ResearchMaterial[];

  constructor(materials: ResearchMaterial[], id = "static") {
    this.id = id;
    this.materials = materials.map(sanitizeResearchMaterial);
  }

  async collect(): Promise<ResearchMaterial[]> {
    return this.materials;
  }
}

function isPageContentLike(value: unknown): value is PageContentLike {
  return Boolean(value && typeof value === "object" && "content" in value && "url" in value);
}

function isSearchResultLike(value: unknown): value is SearchResultLike {
  return Boolean(value && typeof value === "object" && "title" in value && "url" in value);
}

function isResearchMaterial(value: unknown): value is ResearchMaterial {
  return Boolean(value && typeof value === "object" && "id" in value && "content" in value);
}

function sanitizeResearchMaterial(material: ResearchMaterial): ResearchMaterial {
  return {
    id: sanitizeLegacyStageText(material.id),
    ...(material.title ? { title: sanitizeLegacyStageText(material.title) } : {}),
    ...(material.url ? { url: sanitizeLegacyStageText(material.url) } : {}),
    ...(material.source ? { source: sanitizeLegacyStageText(material.source) } : {}),
    content: sanitizeLegacyStageText(material.content),
    ...(material.kind ? { kind: sanitizeLegacyStageText(material.kind) } : {}),
    ...(material.metadata ? { metadata: material.metadata } : {})
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
}

namespace __core_research_critique {
import CritiqueResult = __core_research_types.CritiqueResult;
import Evidence = __core_research_types.Evidence;
import ResearchSynthesisResult = __core_research_types.ResearchSynthesisResult;
export function critiqueResearchResult(
  result: Pick<ResearchSynthesisResult, "question" | "findings" | "contradictions" | "unknowns" | "evidence" | "nextActions">
): CritiqueResult {
  const issues: CritiqueResult["issues"] = [];
  const missingEvidence: string[] = [];

  if (result.evidence.length === 0) {
    issues.push({
      severity: "must-fix",
      issue: "The research result has no evidence/material ID citations.",
      recommendation: "Collect research materials through a source provider before synthesizing conclusions."
    });
    missingEvidence.push("all evidence");
  }

  const unsupportedFindings = result.findings.filter((finding) => finding.evidenceIds.length === 0);
  if (unsupportedFindings.length > 0) {
    issues.push({
      severity: "should-fix",
      issue: `${unsupportedFindings.length} finding(s) have no linked evidence.`,
      recommendation: "Attach evidence IDs to each finding, or move unsupported claims into gaps.",
      evidenceIds: unsupportedFindings.map((finding) => finding.id)
    });
    missingEvidence.push(...unsupportedFindings.map((finding) => finding.id));
  }

  if (!result.contradictions.some((contradiction) => contradiction.priority === "principal")) {
    issues.push({
      severity: "must-fix",
      issue: "No principal contradiction was identified.",
      recommendation: "Mark the primary tradeoff so downstream planning knows what to resolve first."
    });
  }

  if (result.nextActions.length === 0) {
    issues.push({
      severity: "should-fix",
      issue: "The research output has no next action.",
      recommendation: "Add at least one verifiable next step."
    });
  }

  return {
    summary:
      issues.length === 0
        ? "Self-critique: evidence, principal contradiction, and next actions are present."
        : "Self-critique: research quality issues need attention before downstream planning.",
    issues,
    selfCritique: buildSelfCritique(result.evidence, result.unknowns, issues.length),
    missingEvidence
  };
}

function buildSelfCritique(evidence: Evidence[], unknowns: string[], issueCount: number): string[] {
  const critique = [
    "Investigation before judgment: materials were normalized into evidence before findings were synthesized.",
    "Evidence traceability: findings and contradictions cite evidence IDs that point back to material IDs.",
    "Abstraction risk: routing or planning decisions should wait for source adapters to be verified with real providers."
  ];
  if (evidence.length < 3) {
    critique.push("Evidence coverage is thin; add independent sources before treating the answer as settled.");
  }
  if (unknowns.length > 0) {
    critique.push(`Known gaps remain: ${unknowns.join(" ")}`);
  }
  if (issueCount > 0) {
    critique.push("Fix must-fix and should-fix issues before using this as a final research basis.");
  }
  return critique;
}
}

namespace __core_research_synthesis {
import critiqueResearchResult = __core_research_critique.critiqueResearchResult;
import sanitizeLegacyStageText = __core_research_sourceProvider.sanitizeLegacyStageText;
import Contradiction = __core_research_types.Contradiction;
import Evidence = __core_research_types.Evidence;
import Finding = __core_research_types.Finding;
import ResearchMaterial = __core_research_types.ResearchMaterial;
import ResearchPlan = __core_research_types.ResearchPlan;
import ResearchPlanStep = __core_research_types.ResearchPlanStep;
import ResearchSynthesisResult = __core_research_types.ResearchSynthesisResult;
import SynthesisOptions = __core_research_types.SynthesisOptions;
const DEFAULT_METHODS = [
  "investigation-first",
  "source-adapter-review",
  "contradiction-analysis",
  "critique-loop"
];

const ROUTE_TERMS = ["route", "routing", "router", "orchestrator"];
const INTEGRATION_TERMS = ["integrate", "integration", "adapter", "source", "search", "fetch", "evidence", "material"];

export function runResearchSynthesis(input: { question: string; materials: ResearchMaterial[]; constraints?: string[] | undefined }): ResearchSynthesisResult {
  const question = sanitizeLegacyStageText(input.question.trim() || "Research question");
  const materials = input.materials.map(normalizeMaterial).filter((material) => material.content.trim().length > 0);
  const evidence = buildEvidence(materials);
  const findings = synthesizeFindings(materials, { question, constraints: input.constraints });
  const contradictions = analyzeContradictions(materials, question);
  const plan = createResearchPlan({ question, materials });
  const unknowns = inferUnknowns(materials);
  const nextActions = inferNextActions(materials);
  const partial = {
    question,
    summary: buildSummary(question, findings, contradictions),
    investigationSummary: buildInvestigationSummary(materials, evidence),
    findings,
    contradictions,
    unknowns,
    evidence,
    plan,
    keyResources: plan.keyResources,
    breakthrough: plan.breakthrough,
    longTermRoute: plan.longTermRoute,
    feedbackSynthesis: buildFeedbackSynthesis(materials, input.constraints ?? []),
    nextActions
  };
  return { ...partial, critique: critiqueResearchResult(partial) };
}

export function buildEvidence(materials: ResearchMaterial[]): Evidence[] {
  return materials.map((material, index) => ({
    id: `E${index + 1}`,
    materialId: material.id,
    quote: compact(material.content, 220),
    note: `${material.title ?? material.id} supplies research material through ${material.source ?? material.kind ?? "an input source"}.`,
    ...(material.url ? { url: material.url } : {})
  }));
}

export function synthesizeFindings(materials: ResearchMaterial[], options: SynthesisOptions = {}): Finding[] {
  const evidence = buildEvidence(materials);
  const byKind = groupMaterialIdsByKind(materials);
  const findingInputs: Array<{ statement: string; materialIds: string[] }> = [];

  if (byKind.has("search-result")) {
    findingInputs.push({
      statement: "Search results provide the initial source map and candidate claims; they should be treated as pointers until page evidence confirms them.",
      materialIds: byKind.get("search-result") ?? []
    });
  }

  if (byKind.has("page")) {
    findingInputs.push({
      statement: "Fetched or fallback page material gives the synthesis a concrete evidence layer with material IDs and source URLs.",
      materialIds: byKind.get("page") ?? []
    });
  }

  const fallbackIds = materials.filter((material) => material.metadata?.fetchStatus === "failed").map((material) => material.id);
  if (fallbackIds.length > 0) {
    findingInputs.push({
      statement: "One or more page fetches failed, so snippets were retained as lower-confidence fallback evidence instead of being dropped.",
      materialIds: fallbackIds
    });
  }

  if (options.constraints?.length) {
    findingInputs.push({
      statement: `User constraints shape the research boundary: ${options.constraints.map(sanitizeLegacyStageText).join("; ")}.`,
      materialIds: materials.slice(0, 1).map((material) => material.id)
    });
  }

  if (findingInputs.length === 0) {
    findingInputs.push({
      statement: "No usable source material was collected; conclusions must remain provisional until sources are added.",
      materialIds: []
    });
  }

  return findingInputs.map((input, index) => {
    const evidenceIds = evidence.filter((item) => input.materialIds.includes(item.materialId)).map((item) => item.id);
    return {
      id: `F${index + 1}`,
      statement: sanitizeLegacyStageText(input.statement),
      evidenceIds,
      confidence: evidenceIds.length === 0 ? "low" : evidenceIds.length > 1 ? "high" : "medium"
    };
  });
}

export function analyzeContradictions(materials: ResearchMaterial[], question = ""): Contradiction[] {
  const evidence = buildEvidence(materials);
  const routeEvidence = evidence.filter((item) => includesAny(`${item.quote ?? ""} ${item.note}`, ROUTE_TERMS)).map((item) => item.id);
  const integrationEvidence = evidence.filter((item) => includesAny(`${item.quote ?? ""} ${item.note}`, INTEGRATION_TERMS)).map((item) => item.id);
  const allEvidence = evidence.map((item) => item.id);
  const asksAboutRouting = includesAny(question, ROUTE_TERMS);
  const principalEvidence = unique([...routeEvidence, ...integrationEvidence, ...allEvidence.slice(0, 2)]);

  return [
    {
      id: "C1",
      label: asksAboutRouting ? "Routing abstraction vs evidence-backed integration" : "Claim breadth vs evidence depth",
      sideA: asksAboutRouting ? "Design the routing abstraction first." : "Make a broad research claim quickly.",
      sideB: asksAboutRouting ? "Validate source adapters and evidence flow before routing policy hardens." : "Keep claims tied to fetched material and citations.",
      nature: "technical",
      priority: "principal",
      dominantSide: "B",
      rationale: "A stable research workflow depends on traceable source material, evidence IDs, and critique before higher-level orchestration can rely on it.",
      evidenceIds: principalEvidence
    },
    {
      id: "C2",
      label: "Source breadth vs source depth",
      sideA: "Collect enough independent sources to avoid a narrow view.",
      sideB: "Fetch and inspect the highest-value pages deeply enough to support findings.",
      nature: "resource",
      priority: "secondary",
      dominantSide: "balanced",
      rationale: "The service should keep search-result metadata while prioritizing fetched excerpts for stronger evidence.",
      evidenceIds: allEvidence.slice(0, Math.min(3, allEvidence.length))
    }
  ];
}

export function createResearchPlan(input: { question: string; materials: ResearchMaterial[] }): ResearchPlan {
  const steps: ResearchPlanStep[] = DEFAULT_METHODS.map((method, index) => ({
    id: `P${index + 1}`,
    method,
    objective: planObjective(method),
    output: planOutput(method)
  }));
  return {
    question: sanitizeLegacyStageText(input.question),
    mode: input.materials.length > 4 ? "deep" : "standard",
    steps,
    keyResources: inferKeyResources(input.materials),
    breakthrough: "Breakthrough: keep source adapters, evidence synthesis, and critique deterministic behind the existing DeepResearchService contract.",
    longTermRoute: [
      "Stabilize source material schemas and evidence IDs inside the research service.",
      "Let the product route web/search providers into the service once adapter behavior is verified.",
      "Preserve critique output for audit, regression tests, and downstream task context."
    ]
  };
}

function buildSummary(question: string, findings: Finding[], contradictions: Contradiction[]): string {
  const firstFinding = findings[0]?.statement ?? "No finding was synthesized.";
  const principal = contradictions.find((item) => item.priority === "principal")?.label ?? "not identified";
  return `Research conclusion for "${question}": ${firstFinding} The principal tension is ${principal}.`;
}

function buildInvestigationSummary(materials: ResearchMaterial[], evidence: Evidence[]): string {
  const counts = [...groupMaterialIdsByKind(materials).entries()].map(([kind, ids]) => `${kind}:${ids.length}`).join(", ");
  const citations = evidence.slice(0, 6).map((item) => `${item.id}/${item.materialId}`).join(", ");
  return `Investigation summary: normalized ${materials.length} material item(s) (${counts || "unclassified"}) and produced citations ${citations || "none"}.`;
}

function buildFeedbackSynthesis(materials: ResearchMaterial[], constraints: string[]): string {
  const sources = unique(materials.map((material) => material.source ?? material.kind ?? "unknown")).join(", ");
  const constraintText = constraints.length ? ` Constraints: ${constraints.map(sanitizeLegacyStageText).join("; ")}.` : "";
  return `Feedback synthesis: source inputs come from ${sources || "no sources"}. Agreement is strongest where search metadata, fetched text, and critique point to the same evidence-backed workflow.${constraintText}`;
}

function inferUnknowns(materials: ResearchMaterial[]): string[] {
  const unknowns: string[] = [];
  if (!materials.some((material) => material.kind === "page")) {
    unknowns.push("No fetched page material is available, so source snippets need follow-up.");
  }
  if (materials.length < 2) {
    unknowns.push("Source diversity is low; add independent sources before treating findings as settled.");
  }
  if (materials.some((material) => material.metadata?.fetchStatus === "failed")) {
    unknowns.push("At least one source used snippet fallback because fetching failed.");
  }
  return unknowns;
}

function inferNextActions(materials: ResearchMaterial[]): string[] {
  const actions = [
    "Use the evidence IDs when turning the research output into task context or a Canvas artifact.",
    "Add independent sources when findings rely on a single material item.",
    "Review critique issues before downstream planning consumes the result."
  ];
  if (materials.some((material) => material.metadata?.fetchStatus === "failed")) {
    actions.unshift("Retry failed fetches or replace snippet fallback with a stronger source excerpt.");
  }
  return actions;
}

function inferKeyResources(materials: ResearchMaterial[]): string[] {
  const resources = ["DeepResearchService public run contract", "Research material schemas", "Deterministic synthesis and critique"];
  if (materials.some((material) => material.kind === "search-result")) resources.push("Search-result source adapter");
  if (materials.some((material) => material.kind === "page")) resources.push("Fetched page material adapter");
  return resources;
}

function planObjective(method: string): string {
  const objectives: Record<string, string> = {
    "investigation-first": "Normalize source material before making claims.",
    "source-adapter-review": "Confirm each source shape keeps URL, title, snippet, and metadata.",
    "contradiction-analysis": "Name the principal tension and cite supporting evidence.",
    "critique-loop": "Check unsupported findings, missing actions, and source gaps."
  };
  return objectives[method] ?? "Run a research step.";
}

function planOutput(method: string): string {
  const outputs: Record<string, string> = {
    "investigation-first": "Evidence list",
    "source-adapter-review": "Source metadata",
    "contradiction-analysis": "Contradictions and gaps",
    "critique-loop": "Critique report"
  };
  return outputs[method] ?? "Structured result";
}

function normalizeMaterial(material: ResearchMaterial, index: number): ResearchMaterial {
  return {
    ...material,
    id: sanitizeLegacyStageText(material.id || `material-${index + 1}`),
    content: sanitizeLegacyStageText(material.content).trim(),
    ...(material.title ? { title: sanitizeLegacyStageText(material.title) } : {}),
    ...(material.url ? { url: sanitizeLegacyStageText(material.url) } : {}),
    ...(material.source ? { source: sanitizeLegacyStageText(material.source) } : {}),
    ...(material.kind ? { kind: sanitizeLegacyStageText(material.kind) } : {})
  };
}

function groupMaterialIdsByKind(materials: ResearchMaterial[]): Map<string, string[]> {
  const byKind = new Map<string, string[]>();
  for (const material of materials) {
    const kind = material.kind ?? "note";
    byKind.set(kind, [...(byKind.get(kind) ?? []), material.id]);
  }
  return byKind;
}

function includesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function compact(text: string, max = 180): string {
  const singleLine = sanitizeLegacyStageText(text).replace(/\s+/g, " ").trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 3)}...` : singleLine;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
}

namespace __core_research_deepResearchService {
import compactTaskTitle = __core_utils_title.compactTaskTitle;
import fetchedTextToMaterial = __core_research_sourceProvider.fetchedTextToMaterial;
import fetchFallbackToMaterial = __core_research_sourceProvider.fetchFallbackToMaterial;
import sanitizeLegacyStageText = __core_research_sourceProvider.sanitizeLegacyStageText;
import sanitizeResearchSource = __core_research_sourceProvider.sanitizeResearchSource;
import searchResultsToMaterials = __core_research_sourceProvider.searchResultsToMaterials;
import runResearchSynthesis = __core_research_synthesis.runResearchSynthesis;
import Evidence = __core_research_types.Evidence;
import ResearchMaterial = __core_research_types.ResearchMaterial;
export type ResearchSource = __core_research_types.ResearchSource;
import ResearchSynthesisResult = __core_research_types.ResearchSynthesisResult;
export interface DeepResearchResult {
  query: string;
  title: string;
  content: string;
  sources: ResearchSource[];
}

export interface DeepResearchDeps {
  search(query: string): Promise<ResearchSource[]>;
  fetchText(url: string): Promise<string>;
}

interface SourceRecord {
  source: ResearchSource;
  searchMaterialId: string;
  pageMaterialId?: string | undefined;
  fetchStatus: "pending" | "fetched" | "failed" | "not-fetched";
}

interface ExcerptRecord {
  title: string;
  url: string;
  materialId: string;
  fetchStatus: "fetched" | "failed";
  text: string;
}

export class DeepResearchService {
  constructor(private readonly deps: DeepResearchDeps) {}

  async run(input: { query: string; limit?: number | undefined }): Promise<DeepResearchResult> {
    const query = sanitizeLegacyStageText(input.query.trim() || "Research");
    const limit = normalizeLimit(input.limit);
    const rawSources = (await this.deps.search(query)).slice(0, limit);
    const sanitizedSources = rawSources.map((source, index) => sanitizeResearchSource(source, { rank: index + 1 }));
    const searchMaterials = searchResultsToMaterials(sanitizedSources);
    const records: SourceRecord[] = sanitizedSources.map((source, index) => ({
      source,
      searchMaterialId: searchMaterials[index]?.id ?? `search-${index + 1}`,
      fetchStatus: "not-fetched"
    }));

    const pageMaterials: ResearchMaterial[] = [];
    const excerpts: ExcerptRecord[] = [];
    for (const [index, record] of records.slice(0, Math.min(4, limit)).entries()) {
      try {
        const text = (await this.deps.fetchText(record.source.url)).slice(0, 3000);
        const material = fetchedTextToMaterial(record.source, text, index);
        pageMaterials.push(material);
        record.pageMaterialId = material.id;
        record.fetchStatus = "fetched";
        excerpts.push({
          title: record.source.title,
          url: record.source.url,
          materialId: material.id,
          fetchStatus: "fetched",
          text: material.content
        });
      } catch (error) {
        const material = fetchFallbackToMaterial(record.source, index, error);
        pageMaterials.push(material);
        record.pageMaterialId = material.id;
        record.fetchStatus = "failed";
        excerpts.push({
          title: record.source.title,
          url: record.source.url,
          materialId: material.id,
          fetchStatus: "failed",
          text: material.content
        });
      }
    }

    const sources = records.map((record) => withSourceMetadata(record));
    const materials = [...searchMaterials, ...pageMaterials];
    const synthesis = runResearchSynthesis({ question: query, materials });
    const title = compactTaskTitle(query, "Pinocchio research", "研究");
    const content = renderResearchMarkdown({ title, query, synthesis, sources, materials, excerpts });
    return { query, title, content, sources };
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 6;
  return Math.max(0, Math.floor(limit));
}

function withSourceMetadata(record: SourceRecord): ResearchSource {
  return sanitizeResearchSource(record.source, {
    searchMaterialId: record.searchMaterialId,
    fetchStatus: record.fetchStatus,
    ...(record.pageMaterialId ? { pageMaterialId: record.pageMaterialId } : {})
  });
}

function renderResearchMarkdown(input: {
  title: string;
  query: string;
  synthesis: ResearchSynthesisResult;
  sources: ResearchSource[];
  materials: ResearchMaterial[];
  excerpts: ExcerptRecord[];
}): string {
  const lines = [
    `# ${input.title}`,
    "",
    "## Summary",
    input.synthesis.summary,
    "",
    "## Investigation",
    input.synthesis.investigationSummary,
    "",
    "## Source Metadata",
    ...renderSourceMetadata(input.sources),
    "",
    "## Evidence",
    ...renderEvidence(input.synthesis.evidence),
    "",
    "## Findings",
    ...input.synthesis.findings.map((finding) => `- [${finding.id}] ${finding.statement} (confidence: ${finding.confidence}; evidence: ${formatIds(finding.evidenceIds)})`),
    "",
    "## Contradictions and Gaps",
    ...input.synthesis.contradictions.map(
      (contradiction) =>
        `- [${contradiction.id}] ${contradiction.priority}: ${contradiction.label}. ${contradiction.rationale} (evidence: ${formatIds(contradiction.evidenceIds)})`
    ),
    ...input.synthesis.unknowns.map((unknown) => `- Gap: ${unknown}`),
    "",
    "## Critique",
    input.synthesis.critique.summary,
    ...renderCritiqueIssues(input.synthesis.critique.issues),
    ...input.synthesis.critique.selfCritique.map((item) => `- Self-check: ${item}`),
    ...(input.synthesis.critique.missingEvidence.length ? [`- Missing evidence: ${input.synthesis.critique.missingEvidence.join(", ")}`] : []),
    "",
    "## Next Actions",
    ...input.synthesis.nextActions.map((action) => `- ${action}`),
    "",
    "## Excerpts",
    ...renderExcerpts(input.excerpts),
    "",
    "## Materials",
    ...input.materials.map((material) => `- [${material.id}] kind: ${material.kind ?? "note"}; source: ${material.source ?? "unknown"}`)
  ];
  return sanitizeLegacyStageText(lines.join("\n")).trim();
}

function renderSourceMetadata(sources: ResearchSource[]): string[] {
  if (sources.length === 0) return ["- No sources returned."];
  return sources.map((source, index) => {
    const metadata = source.metadata ?? {};
    const searchMaterialId = typeof metadata.searchMaterialId === "string" ? metadata.searchMaterialId : "none";
    const pageMaterialId = typeof metadata.pageMaterialId === "string" ? metadata.pageMaterialId : "none";
    const fetchStatus = typeof metadata.fetchStatus === "string" ? metadata.fetchStatus : "not-fetched";
    return `- [S${index + 1}] ${source.title} (${source.url}) source metadata: searchMaterialId=${searchMaterialId}; pageMaterialId=${pageMaterialId}; fetchStatus=${fetchStatus}`;
  });
}

function renderEvidence(evidence: Evidence[]): string[] {
  if (evidence.length === 0) return ["- No evidence was collected."];
  return evidence.map((item) => `- [${item.id}] materialId: ${item.materialId}; quote: ${item.quote ?? "No quote."}; note: ${item.note}`);
}

function renderCritiqueIssues(issues: ResearchSynthesisResult["critique"]["issues"]): string[] {
  if (issues.length === 0) return ["- Issues: none."];
  return issues.map((issue) => `- Issue (${issue.severity}): ${issue.issue} Recommendation: ${issue.recommendation}`);
}

function renderExcerpts(excerpts: ExcerptRecord[]): string[] {
  if (excerpts.length === 0) return ["- No fetched excerpts."];
  return excerpts.map((excerpt, index) =>
    [`### Excerpt ${index + 1}: ${excerpt.title}`, `- url: ${excerpt.url}`, `- materialId: ${excerpt.materialId}`, `- fetchStatus: ${excerpt.fetchStatus}`, "", excerpt.text].join("\n")
  );
}

function formatIds(ids: string[]): string {
  return ids.length ? ids.join(", ") : "none";
}
}

namespace __core_runtime_researchFactory {
import ResearchSource = __core_research_deepResearchService.ResearchSource;
import DeepResearchService = __core_research_deepResearchService.DeepResearchService;
import ToolRouter = __core_core_toolRouter.ToolRouter;
interface RuntimeResearchDeps {
  toolRouter: ToolRouter;
  useMockLlm: boolean;
}

export function createRuntimeResearch({ toolRouter, useMockLlm }: RuntimeResearchDeps): DeepResearchService {
  return new DeepResearchService({
    search: useMockLlm ? mockResearchSearch : async (query) => {
      const result = await toolRouter.executeTool(
        { id: `research_search_${Date.now()}`, type: "function", function: { name: "web_search", arguments: JSON.stringify({ query, maxResults: 6 }) } },
        { requestId: "deep-research" }
      );
      if (!result.ok) throw new Error(result.error?.message ?? "Search failed");
      return normalizeSearchResults(JSON.parse(result.content));
    },
    fetchText: useMockLlm ? mockResearchFetch : async (url) => {
      const result = await toolRouter.executeTool(
        { id: `research_fetch_${Date.now()}`, type: "function", function: { name: "web_fetch", arguments: JSON.stringify({ url }) } },
        { requestId: "deep-research" }
      );
      if (!result.ok) throw new Error(result.error?.message ?? "Fetch failed");
      return String((JSON.parse(result.content) as { text?: unknown }).text ?? "");
    }
  });
}

async function mockResearchSearch(query: string): Promise<ResearchSource[]> {
  return [
    { title: `Mock research source: ${query}`, url: "https://example.com/deep-research", snippet: "Deterministic E2E source." },
    { title: "Mock supporting source", url: "https://example.com/supporting-source", snippet: "Local test fixture." }
  ];
}

async function mockResearchFetch(url: string): Promise<string> {
  return `Fetched mock research text from ${url}. This deterministic source supports deep research E2E tests.`;
}

function normalizeSearchResults(value: unknown): ResearchSource[] {
  const results = Array.isArray((value as { results?: unknown }).results) ? (value as { results: unknown[] }).results : [];
  return results.flatMap((item) => {
    const row = item as { title?: unknown; url?: unknown; snippet?: unknown };
    return typeof row.title === "string" && typeof row.url === "string"
      ? [{ title: row.title, url: row.url, ...(typeof row.snippet === "string" ? { snippet: row.snippet } : {}) }]
      : [];
  });
}
}

namespace __core_config_models {
import ReasoningEffort = __ext_1.ReasoningEffort;
import ThinkingConfig = __ext_1.ThinkingConfig;
export function normalizeThinking(input: ThinkingConfig): ThinkingConfig {
  if (input.type === "disabled") return { type: "disabled" };
  const effort: ReasoningEffort = input.reasoningEffort ?? "high";
  if (effort !== "high" && effort !== "max") {
    throw new Error(`Unsupported reasoning_effort: ${String(effort)}`);
  }
  return { type: "enabled", reasoningEffort: effort };
}

export function isReasoningMode(mode: string): boolean {
  return ["thinking", "planning", "coding", "multi-agent"].includes(mode);
}
}

namespace __core_core_llmClient {
import ChatMessage = __ext_1.ChatMessage;
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import ModelName = __ext_1.ModelName;
import ReasoningEffort = __ext_1.ReasoningEffort;
import ThinkingConfig = __ext_1.ThinkingConfig;
import normalizeThinking = __core_config_models.normalizeThinking;
import normalizeDeepSeekUsage = __core_usage_modelUsage.normalizeDeepSeekUsage;
export interface ModelToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

export interface LLMRequest {
  model: ModelName;
  thinking: ThinkingConfig;
  messages: ChatMessage[];
  stream?: boolean | undefined;
  tools?: ModelToolSchema[] | undefined;
  temperature?: number | undefined;
  top_p?: number | undefined;
  presence_penalty?: number | undefined;
  frequency_penalty?: number | undefined;
}

export interface LLMResponse {
  message: ChatMessage;
  usage?: DeepSeekRawUsage | undefined;
}

export interface LLMStreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: ChatMessage["tool_calls"];
  usage?: DeepSeekRawUsage | undefined;
}

export type FetchLike = typeof fetch;
const deepSeekApiBaseUrl = "https://api.deepseek.com";

export interface LLMClient {
  complete(input: LLMRequest): Promise<LLMResponse>;
  stream(input: LLMRequest): AsyncIterable<LLMStreamDelta>;
}

export function buildDeepSeekRequestBody(input: LLMRequest): Record<string, unknown> {
  const thinking = normalizeThinking(input.thinking);
  const forbidden = ["temperature", "top_p", "presence_penalty", "frequency_penalty"] as const;
  if (thinking.type === "enabled") {
    for (const key of forbidden) {
      if (input[key] !== undefined) throw new Error(`${key} is not allowed when thinking is enabled`);
    }
  }
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages.map(toDeepSeekMessage),
    thinking: { type: thinking.type }
  };
  if (thinking.type === "enabled") body.reasoning_effort = thinking.reasoningEffort;
  if (input.stream) body.stream = true;
  if (input.stream) body.stream_options = { include_usage: true };
  if (input.tools?.length) body.tools = input.tools;
  if (thinking.type === "disabled") {
    for (const key of forbidden) if (input[key] !== undefined) body[key] = input[key];
  }
  return body;
}

export class DeepSeekLLMClient implements LLMClient {
  constructor(
    private readonly options: { apiKey?: string | undefined; fetchFn?: FetchLike | undefined } = {}
  ) {}

  async complete(input: LLMRequest): Promise<LLMResponse> {
    const json = await this.post(input, false);
    const choice = json.choices?.[0]?.message ?? {};
    return { message: fromDeepSeekMessage(choice), usage: normalizeDeepSeekUsage(json.usage) };
  }

  async *stream(input: LLMRequest): AsyncIterable<LLMStreamDelta> {
    const response = await this.raw(input, true);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek stream request failed: ${response.status} ${text}`);
    }
    if (!response.body) throw new Error("DeepSeek stream response has no body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta ?? {};
        const usage = normalizeDeepSeekUsage(parsed.usage);
        yield {
          content: delta.content,
          reasoning_content: delta.reasoning_content,
          tool_calls: delta.tool_calls,
          usage
        };
      }
    }
  }

  private async post(input: LLMRequest, stream: boolean): Promise<any> {
    const response = await this.raw(input, stream);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek request failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  private async raw(input: LLMRequest, stream: boolean): Promise<Response> {
    if (!this.options.apiKey) throw new Error("DEEPSEEK_API_KEY is required for real LLM calls");
    const fetchFn = this.options.fetchFn ?? fetch;
    const body = buildDeepSeekRequestBody({ ...input, stream });
    return fetchFn(`${deepSeekApiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }
}

function toDeepSeekMessage(message: ChatMessage): Record<string, unknown> {
  const content = addContextLabel(message);
  return {
    role: message.role,
    content,
    reasoning_content: message.reasoning_content,
    tool_calls: message.tool_calls,
    tool_call_id: message.tool_call_id
  };
}

function addContextLabel(message: ChatMessage): string | null {
  if (message.content === null) return null;
  if (!message.contextKind || message.role === "system") return message.content;
  return `[context:${message.contextKind}]\n${message.content}`;
}

function fromDeepSeekMessage(message: any): ChatMessage {
  return {
    id: message.id ?? `asst_${Date.now()}`,
    role: "assistant",
    content: message.content ?? "",
    reasoning_content: message.reasoning_content ?? null,
    tool_calls: message.tool_calls,
    createdAt: new Date().toISOString()
  };
}
}

namespace __core_canvas_officeZip {

export function zipBase64(entries: { name: string; content: string }[]): string {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]).toString("base64");
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
}

namespace __core_canvas_canvasDocx {
import CanvasBlock = __ext_1.CanvasBlock;
import CanvasContent = __ext_1.CanvasContent;
import zipBase64 = __core_canvas_officeZip.zipBase64;
export function canvasContentToDocxBase64(content: CanvasContent, title = "Canvas"): string {
  const documentXml = documentXmlFor(content, title);
  return zipBase64([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>"
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>"
    },
    { name: "word/document.xml", content: documentXml }
  ]);
}

function documentXmlFor(content: CanvasContent, title: string): string {
  const body = content.blocks.length ? content.blocks.map(blockXml).join("") : paragraphXml(title);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>` +
    "</w:document>"
  );
}

function blockXml(block: CanvasBlock): string {
  if (block.type === "heading") return paragraphXml(text(block), `Heading${Math.min(3, Math.max(1, Number(block.attrs?.level ?? 1)))}`);
  if (block.type === "list" || block.type === "taskList") return (block.content ?? []).map((item) => paragraphXml(`- ${text(item)}`)).join("");
  if (block.type === "table") return tableText(block).map((line) => paragraphXml(line)).join("");
  if (block.type === "code" || block.type === "mermaid" || block.type === "vegaLite" || block.type === "math") return paragraphXml(text(block), undefined, "Consolas");
  if (block.type === "divider") return paragraphXml("");
  if (block.content?.length) return block.content.map(blockXml).join("");
  return paragraphXml(text(block));
}

function paragraphXml(value: string, style?: string, font?: string): string {
  const styleXml = style ? `<w:pStyle w:val="${escapeXml(style)}"/>` : "";
  const fontXml = font ? `<w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}"/>` : "";
  const paragraphProps = styleXml ? `<w:pPr>${styleXml}</w:pPr>` : "";
  const runProps = fontXml ? `<w:rPr>${fontXml}</w:rPr>` : "";
  return `<w:p>${paragraphProps}<w:r>${runProps}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`;
}

function tableText(block: CanvasBlock): string[] {
  const rows = Array.isArray(block.attrs?.rows) ? block.attrs.rows : [];
  return rows.flatMap((row) => (Array.isArray(row) ? [row.map((cell) => String(cell)).join(" | ")] : []));
}

function text(block: CanvasBlock): string {
  return block.text ?? block.content?.map(text).join("\n") ?? "";
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
}

namespace __core_canvas_canvasPptx {
import CanvasBlock = __ext_1.CanvasBlock;
import CanvasContent = __ext_1.CanvasContent;
import zipBase64 = __core_canvas_officeZip.zipBase64;
type Slide = {
  title: string;
  lines: string[];
};

const slideWidth = 12192000;
const slideHeight = 6858000;
const productName = "Pinocchio";

export function canvasContentToPptxBase64(content: CanvasContent, title = "Canvas"): string {
  const slides = slidesFor(content, title);
  return zipBase64([
    { name: "[Content_Types].xml", content: contentTypesXml(slides.length) },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "docProps/app.xml", content: appPropsXml(slides.length) },
    { name: "docProps/core.xml", content: corePropsXml(title) },
    { name: "ppt/presentation.xml", content: presentationXml(slides.length) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelsXml(slides.length) },
    { name: "ppt/theme/theme1.xml", content: themeXml() },
    { name: "ppt/slideMasters/slideMaster1.xml", content: slideMasterXml() },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: slideMasterRelsXml() },
    { name: "ppt/slideLayouts/slideLayout1.xml", content: slideLayoutXml() },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: slideLayoutRelsXml() },
    ...slides.flatMap((slide, index) => [
      { name: `ppt/slides/slide${index + 1}.xml`, content: slideXml(slide, index + 1) },
      { name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, content: slideRelsXml() }
    ])
  ]);
}

function slidesFor(content: CanvasContent, title: string): Slide[] {
  if (content.deck?.slides.length) {
    return content.deck.slides.map((slide) => {
      const lines = slide.visibleText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const firstLineIsTitle = lines[0] === slide.title;
      return {
        title: slide.title || title,
        lines: (firstLineIsTitle ? lines.slice(1) : lines).slice(0, 10)
      };
    });
  }
  const blocks = content.blocks.length ? content.blocks : [{ id: "fallback", type: "paragraph" as const, text: title }];
  const slides: Slide[] = [];
  let current: CanvasBlock[] = [];

  for (const block of blocks) {
    if (block.type === "divider") {
      pushSlide(slides, current, title);
      current = [];
      continue;
    }
    if (block.type === "heading" && current.length) {
      pushSlide(slides, current, title);
      current = [block];
      continue;
    }
    current.push(block);
  }
  pushSlide(slides, current, title);
  return slides.length ? slides : [{ title, lines: [] }];
}

function pushSlide(slides: Slide[], blocks: CanvasBlock[], fallbackTitle: string): void {
  const clean = blocks.filter((block) => block.type !== "divider");
  if (!clean.length) return;
  const first = clean[0];
  const title = first?.type === "heading" ? text(first) : fallbackTitle;
  const bodyBlocks = first?.type === "heading" ? clean.slice(1) : clean;
  const lines = bodyBlocks.flatMap(blockLines).map((line) => line.trim()).filter(Boolean).slice(0, 10);
  slides.push({ title: title.trim() || fallbackTitle, lines });
}

function blockLines(block: CanvasBlock): string[] {
  if (block.type === "list" || block.type === "taskList") return (block.content ?? []).map((item) => text(item));
  if (block.type === "table") return tableText(block);
  if (block.content?.length) return block.content.flatMap(blockLines);
  const value = text(block);
  return value ? [value] : [];
}

function tableText(block: CanvasBlock): string[] {
  const rows = Array.isArray(block.attrs?.rows) ? block.attrs.rows : [];
  return rows.flatMap((row) => (Array.isArray(row) ? [row.map((cell) => String(cell)).join(" | ")] : []));
}

function text(block: CanvasBlock): string {
  return block.text ?? block.content?.map(text).join("\n") ?? "";
}

function contentTypesXml(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  return xml(
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      slides +
    "</Types>"
  );
}

function rootRelsXml(): string {
  return xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    "</Relationships>"
  );
}

function appPropsXml(slideCount: number): string {
  return xml(
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      `<Application>${productName}</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides>` +
    "</Properties>"
  );
}

function corePropsXml(title: string): string {
  const now = new Date().toISOString();
  return xml(
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${escapeXml(title)}</dc:title><dc:creator>${productName}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

function presentationXml(slideCount: number): string {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  return xml(
    '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst>' +
      `<p:sldIdLst>${slideIds}</p:sldIdLst>` +
      `<p:sldSz cx="${slideWidth}" cy="${slideHeight}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/>` +
    "</p:presentation>"
  );
}

function presentationRelsXml(slideCount: number): string {
  const slideRels = Array.from({ length: slideCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  return xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      slideRels +
      '<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      '<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
    "</Relationships>"
  );
}

function slideXml(slide: Slide, index: number): string {
  return xml(
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F8F8F6"/></a:solidFill></p:bgPr></p:bg>' +
      '<p:spTree>' +
        groupShapeXml() +
        shapeXml(2, `Title ${index}`, 600000, 420000, 10992000, 900000, [slide.title], 3400, true) +
        shapeXml(3, `Body ${index}`, 820000, 1600000, 10560000, 4300000, slide.lines.length ? slide.lines : [" "], 1900, false) +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
    "</p:sld>"
  );
}

function slideRelsXml(): string {
  return xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
    "</Relationships>"
  );
}

function slideMasterXml(): string {
  return xml(
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      `<p:cSld><p:spTree>${groupShapeXml()}</p:spTree></p:cSld>` +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>' +
    "</p:sldMaster>"
  );
}

function slideMasterRelsXml(): string {
  return xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
    "</Relationships>"
  );
}

function slideLayoutXml(): string {
  return xml(
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
      `<p:cSld name="Blank"><p:spTree>${groupShapeXml()}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
    "</p:sldLayout>"
  );
}

function slideLayoutRelsXml(): string {
  return xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
    "</Relationships>"
  );
}

function themeXml(): string {
  return xml(
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${productName}">` +
      '<a:themeElements><a:clrScheme name="Workbench"><a:dk1><a:srgbClr val="1F2937"/></a:dk1><a:lt1><a:srgbClr val="F8F8F6"/></a:lt1><a:dk2><a:srgbClr val="374151"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="059669"/></a:accent2><a:accent3><a:srgbClr val="D97706"/></a:accent3><a:accent4><a:srgbClr val="DC2626"/></a:accent4><a:accent5><a:srgbClr val="7C3AED"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="Workbench"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Workbench"><a:fillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements>' +
    "</a:theme>"
  );
}

function groupShapeXml(): string {
  return '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
}

function shapeXml(id: number, name: string, x: number, y: number, cx: number, cy: number, lines: string[], fontSize: number, title: boolean): string {
  const paragraphs = lines.map((line, index) => paragraphXml(line, fontSize, title ? "1F2937" : "374151", !title && index > 0)).join("");
  return (
    '<p:sp>' +
      `<p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
      `<p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody>` +
    "</p:sp>"
  );
}

function paragraphXml(value: string, fontSize: number, color: string, bullet: boolean): string {
  const paragraphProps = bullet ? '<a:pPr marL="342900" indent="-171450"/>' : "";
  return `<a:p>${paragraphProps}<a:r><a:rPr lang="zh-CN" sz="${fontSize}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(value)}</a:t></a:r></a:p>`;
}

function xml(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value}`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
}

namespace __core_canvas_canvasExport {
import Canvas = __ext_1.Canvas;
import canvasContentToDocxBase64 = __core_canvas_canvasDocx.canvasContentToDocxBase64;
import canvasContentToPptxBase64 = __core_canvas_canvasPptx.canvasContentToPptxBase64;
import canvasContentToHtml = __core_canvas_canvasText.canvasContentToHtml;
import canvasContentToMarkdown = __core_canvas_canvasText.canvasContentToMarkdown;
export type CanvasServerExportFormat = "json" | "markdown" | "html" | "docx" | "pptx";

export function exportCanvasContent(canvas: Canvas, format: CanvasServerExportFormat): string {
  if (format === "json") return JSON.stringify(canvas.contentJson, null, 2);
  if (format === "html") return canvasContentToHtml(canvas.contentJson);
  if (format === "docx") return canvasContentToDocxBase64(canvas.contentJson, canvas.title);
  if (format === "pptx") return canvasContentToPptxBase64(canvas.contentJson, canvas.title);
  return canvasContentToMarkdown(canvas.contentJson);
}
}

namespace __core_canvas_canvasRevisionStore {
import Canvas = __ext_1.Canvas;
import CanvasRevision = __ext_1.CanvasRevision;
import isConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.isConversationWorkspaceStore;
import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
const key = "canvas-revisions.json";

export class CanvasRevisionStore {
  constructor(private readonly storage: StorageAdapter | ConversationWorkspaceStore) {}

  async list(canvasId: string, conversationId?: string | null): Promise<CanvasRevision[]> {
    const revisions = conversationId !== undefined
      ? await this.readScoped(conversationId)
      : await this.readAll();
    return revisions.filter((revision) => revision.canvasId === canvasId).sort((a, b) => b.version - a.version);
  }

  async add(canvas: Canvas, reason: string): Promise<CanvasRevision> {
    const revision: CanvasRevision = {
      id: createId("rev"),
      canvasId: canvas.id,
      version: canvas.version,
      title: canvas.title,
      contentJson: canvas.contentJson,
      contentText: canvas.contentText,
      reason,
      createdAt: nowIso()
    };
    const storage = this.storageForCanvas(canvas);
    const stored = await storage.readJson<CanvasRevision[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    const written = await storage.writeJsonAtomic(key, [revision, ...stored.value]);
    if (!written.ok) throw new Error(written.error.message);
    return revision;
  }

  async previous(canvas: Canvas): Promise<CanvasRevision | undefined> {
    return (await this.list(canvas.id, canvas.conversationId)).find((revision) => revision.version < canvas.version);
  }

  private storageForCanvas(canvas: Canvas): StorageAdapter {
    return isConversationWorkspaceStore(this.storage)
      ? this.storage.storageForConversation(canvas.conversationId)
      : this.storage;
  }

  private async readAll(): Promise<CanvasRevision[]> {
    if (!isConversationWorkspaceStore(this.storage)) {
      const stored = await this.storage.readJson<CanvasRevision[]>(key, []);
      if (!stored.ok) throw new Error(stored.error.message);
      return stored.value;
    }
    const workspace = this.storage;
    const revisions = await Promise.all(workspace.listManifests().map(async (manifest) => {
      const stored = await workspace.storageForConversation(manifest.id).readJson<CanvasRevision[]>(key, []);
      if (!stored.ok) throw new Error(stored.error.message);
      return stored.value;
    }));
    return revisions.flat();
  }

  private async readScoped(conversationId: string | null): Promise<CanvasRevision[]> {
    const storage = isConversationWorkspaceStore(this.storage)
      ? this.storage.storageForConversation(conversationId)
      : this.storage;
    const stored = await storage.readJson<CanvasRevision[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return stored.value;
  }
}
}

namespace __core_cards_cardStore {
import Card = __ext_1.Card;
import CardListFilter = __ext_1.CardListFilter;
import Canvas = __ext_1.Canvas;
import Conversation = __ext_1.Conversation;
import Plan = __ext_1.Plan;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
type CardDatabase = WorkbenchDatabase | ConversationWorkspaceDatabase;

export class CardStore {
  constructor(private readonly db: CardDatabase) {}

  list(filter: CardListFilter = {}): Card[] {
    return this.db.listCards(filter);
  }

  get(id: string): Card | undefined {
    return this.db.getCard(id);
  }

  syncConversation(conversation: Conversation): Card {
    const latest = [...conversation.messages].reverse().find((message) => message.content?.trim())?.content?.trim() ?? "";
    return this.db.upsertCard({
      id: `chat:${conversation.id}`,
      type: "chat",
      sourceId: conversation.id,
      title: conversation.title.trim() || "Chat",
      summary: latest.slice(0, 80),
      archived: false,
      createdAt: conversation.createdAt,
      updatedAt: nowIso()
    });
  }

  syncPlan(plan: Plan): Card {
    return this.db.upsertCard({
      id: `plan:${plan.id}`,
      type: "plan",
      sourceId: plan.id,
      title: plan.primaryGoal.trim() || "Plan",
      summary: `${plan.workflowType} 路 ${plan.phase} 路 ${plan.status}`,
      archived: false,
      createdAt: plan.createdAt,
      updatedAt: nowIso()
    });
  }

  syncCanvas(canvas: Canvas): Card {
    return this.db.upsertCard({
      id: `canvas:${canvas.id}`,
      type: "canvas",
      sourceId: canvas.id,
      title: canvas.title.trim() || canvas.kind,
      summary: `${canvas.kind} 路 ${canvas.updatedAt.slice(0, 10)}`,
      archived: false,
      createdAt: canvas.createdAt,
      updatedAt: nowIso()
    });
  }

  archive(id: string): Card {
    return this.db.setCardArchived(id, true);
  }

  unarchive(id: string): Card {
    return this.db.setCardArchived(id, false);
  }

  removeBySource(type: Card["type"], sourceId: string): void {
    this.db.deleteCard(`${type}:${sourceId}`);
  }
}
}

namespace __core_canvas_canvasStore {
import CardStore = __core_cards_cardStore.CardStore;
import Canvas = __ext_1.Canvas;
import CreateCanvasRequest = __ext_1.CreateCanvasRequest;
import UpdateCanvasRequest = __ext_1.UpdateCanvasRequest;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import isConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.isConversationWorkspaceDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import canvasContentToText = __core_canvas_canvasText.canvasContentToText;
import canvasSummary = __core_canvas_canvasText.canvasSummary;
import emptyCanvasContent = __core_canvas_canvasText.emptyCanvasContent;
import textToCanvasContent = __core_canvas_canvasText.textToCanvasContent;
const key = "canvases/canvases.json";

type Backend = StorageAdapter | WorkbenchDatabase | ConversationWorkspaceDatabase;

export class CanvasStore {
  constructor(
    private readonly backend: Backend,
    private readonly cards?: CardStore
  ) {}

  async list(conversationId?: string | null): Promise<Canvas[]> {
    if (isDatabase(this.backend)) return this.backend.listCanvases(conversationId);
    const stored = await this.backend.readJson<Canvas[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    const canvases = conversationId === undefined
      ? stored.value
      : stored.value.filter((canvas) => canvas.conversationId === conversationId);
    return [...canvases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string, conversationId?: string | null): Promise<Canvas | undefined> {
    if (conversationId !== undefined && isConversationWorkspaceDatabase(this.backend)) {
      const canvas = this.backend.dbForConversation(conversationId).getCanvas(id);
      return canvas?.conversationId === conversationId ? canvas : undefined;
    }
    if (isDatabase(this.backend)) return this.backend.getCanvas(id);
    return (await this.list(conversationId)).find((canvas) => canvas.id === id);
  }

  async create(input: CreateCanvasRequest): Promise<Canvas> {
    if (isDatabase(this.backend)) {
      const canvas = this.backend.createCanvas(input);
      this.cards?.syncCanvas(canvas);
      return canvas;
    }
    const now = nowIso();
    const contentJson = input.contentJson ?? (input.contentText ? textToCanvasContent(input.contentText, input.kind) : emptyCanvasContent());
    const contentText = input.contentText ?? canvasContentToText(contentJson);
    const canvas: Canvas = {
      id: createId("can"),
      conversationId: input.conversationId ?? null,
      title: input.title.trim(),
      kind: input.kind,
      status: input.status ?? "ready",
      contentJson,
      contentText,
      summary: canvasSummary(contentText),
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    };
    await this.saveJson([canvas, ...(await this.list())]);
    this.cards?.syncCanvas(canvas);
    return canvas;
  }

  async update(id: string, input: UpdateCanvasRequest, conversationId?: string | null): Promise<Canvas> {
    if (conversationId !== undefined && isConversationWorkspaceDatabase(this.backend)) {
      const canvas = this.backend.dbForConversation(conversationId).updateCanvas(id, input);
      this.cards?.syncCanvas(canvas);
      return canvas;
    }
    if (isDatabase(this.backend)) {
      const canvas = this.backend.updateCanvas(id, input);
      this.cards?.syncCanvas(canvas);
      return canvas;
    }
    const canvases = await this.list(conversationId);
    const index = canvases.findIndex((canvas) => canvas.id === id);
    if (index === -1) throw new Error("Canvas not found");
    const current = canvases[index]!;
    const contentJson = input.contentJson ?? (input.contentText ? textToCanvasContent(input.contentText, current.kind) : current.contentJson);
    const contentText = input.contentText ?? (input.contentJson ? canvasContentToText(contentJson) : current.contentText);
    const updated: Canvas = {
      ...current,
      title: input.title?.trim() || current.title,
      status: input.status ?? current.status,
      contentJson,
      contentText,
      summary: input.summary ?? canvasSummary(contentText),
      metadata: { ...(current.metadata ?? {}), ...(input.metadata ?? {}) },
      version: current.version + 1,
      updatedAt: nowIso()
    };
    canvases[index] = updated;
    await this.saveJson(canvases);
    this.cards?.syncCanvas(updated);
    return updated;
  }

  async delete(id: string, conversationId?: string | null): Promise<void> {
    if (conversationId !== undefined && isConversationWorkspaceDatabase(this.backend)) {
      this.backend.dbForConversation(conversationId).deleteCanvas(id);
      this.cards?.removeBySource("canvas", id);
      return;
    }
    if (isDatabase(this.backend)) {
      this.backend.deleteCanvas(id);
      this.cards?.removeBySource("canvas", id);
      return;
    }
    await this.saveJson((await this.list()).filter((canvas) => canvas.id !== id));
    this.cards?.removeBySource("canvas", id);
  }

  private async saveJson(canvases: Canvas[]) {
    if (isDatabase(this.backend)) return;
    const stored = await this.backend.writeJsonAtomic(key, canvases);
    if (!stored.ok) throw new Error(stored.error.message);
  }
}

function isDatabase(value: Backend): value is WorkbenchDatabase | ConversationWorkspaceDatabase {
  return typeof (value as WorkbenchDatabase).listCanvases === "function";
}
}

namespace __core_canvas_canvasService {
import Canvas = __ext_1.Canvas;
import CanvasAiEditRequest = __ext_1.CanvasAiEditRequest;
import CanvasBlock = __ext_1.CanvasBlock;
import CanvasKind = __ext_1.CanvasKind;
import CanvasProjectEngine = __ext_1.CanvasProjectEngine;
import CanvasProjectKind = __ext_1.CanvasProjectKind;
import CreateCanvasRequest = __ext_1.CreateCanvasRequest;
import UpdateCanvasRequest = __ext_1.UpdateCanvasRequest;
import CanvasStudioStore = __core_canvasStudio_canvasStudioStore.CanvasStudioStore;
import exportCanvasContent = __core_canvas_canvasExport.exportCanvasContent;
import CanvasServerExportFormat = __core_canvas_canvasExport.CanvasServerExportFormat;
import deckProjectFiles = __core_canvas_canvasDeck.deckProjectFiles;
import CanvasRevisionStore = __core_canvas_canvasRevisionStore.CanvasRevisionStore;
import CanvasStore = __core_canvas_canvasStore.CanvasStore;
import autoLayoutContent = __core_canvas_canvasText.autoLayoutContent;
import textToCanvasContent = __core_canvas_canvasText.textToCanvasContent;
export class CanvasService {
  constructor(private readonly deps: { store: CanvasStore; revisions: CanvasRevisionStore; studio?: CanvasStudioStore }) {}

  list(conversationId?: string | null): Promise<Canvas[]> {
    return this.deps.store.list(conversationId);
  }

  get(id: string, conversationId?: string | null): Promise<Canvas | undefined> {
    return this.deps.store.get(id, conversationId);
  }

  async create(input: CreateCanvasRequest): Promise<Canvas> {
    const studioProject = this.deps.studio && !metadataString(input.metadata, "canvasProjectId")
      ? this.deps.studio.createProject({
        conversationId: input.conversationId ?? null,
        title: input.title,
        kind: canvasProjectKind(input.kind),
        engine: canvasProjectEngine(input.kind),
        metadata: { source: "canvas" }
      })
      : undefined;
    const canvas = await this.deps.store.create({
      ...input,
      metadata: {
        ...(input.metadata ?? {}),
        ...(studioProject ? { canvasProjectId: studioProject.id } : {})
      }
    });
    await this.deps.revisions.add(canvas, "create");
    this.syncStudioCanvas(canvas, "create");
    return canvas;
  }

  async createFromText(input: {
    conversationId?: string | null;
    title: string;
    kind: CanvasKind;
    text: string;
    sourceMessageId?: string;
    taskId?: string;
  }): Promise<Canvas> {
    return this.create({
      conversationId: input.conversationId ?? null,
      title: input.title,
      kind: input.kind,
      contentText: input.text,
      contentJson: textToCanvasContent(input.text, input.kind),
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {})
    });
  }

  async update(id: string, input: UpdateCanvasRequest, conversationId?: string | null): Promise<Canvas> {
    const current = await this.deps.store.get(id, conversationId);
    if (!current) throw new Error("Canvas not found");
    await this.deps.revisions.add(current, input.reason ?? "update");
    const updated = await this.deps.store.update(id, input, conversationId);
    this.syncStudioCanvas(updated, input.reason ?? "update");
    return updated;
  }

  async restorePrevious(id: string, conversationId?: string | null): Promise<Canvas> {
    const current = await this.deps.store.get(id, conversationId);
    if (!current) throw new Error("Canvas not found");
    const previous = await this.deps.revisions.previous(current);
    if (!previous) throw new Error("No previous Canvas revision");
    return this.update(id, {
      title: previous.title,
      contentJson: previous.contentJson,
      contentText: previous.contentText,
      reason: "restore"
    }, conversationId);
  }

  async applyAction(id: string, request: CanvasAiEditRequest, conversationId?: string | null): Promise<Canvas> {
    const canvas = await this.deps.store.get(id, conversationId);
    if (!canvas) throw new Error("Canvas not found");
    if (request.action === "auto_layout") {
      const contentJson = autoLayoutContent(canvas.contentJson);
      return this.update(id, { contentJson, reason: "auto_layout" }, conversationId);
    }
    const prefix = actionPrefix(request.action, request.instruction);
    const target = request.selection?.trim() || canvas.contentText;
    return this.update(id, {
      contentText: `${prefix}\n\n${target}`.trim(),
      reason: request.action
    }, conversationId);
  }

  async export(id: string, format: CanvasServerExportFormat, conversationId?: string | null): Promise<string> {
    const canvas = await this.deps.store.get(id, conversationId);
    if (!canvas) throw new Error("Canvas not found");
    return exportCanvasContent(canvas, format);
  }

  private syncStudioCanvas(canvas: Canvas, reason: string): void {
    const studio = this.deps.studio;
    const projectId = metadataString(canvas.metadata, "canvasProjectId");
    if (!studio || !projectId || !studio.getProject(projectId)) return;
    studio.updateProject(projectId, {
      title: canvas.title,
      metadata: { source: "canvas", canvasId: canvas.id, canvasKind: canvas.kind }
    });
    const files = canvas.kind === "ppt" && canvas.contentJson.deck
      ? deckProjectFiles(canvas.contentJson.deck, canvas.contentText)
      : [{ path: canvasFilePath(canvas.kind), role: "canvas", textContent: canvas.contentText }];
    for (const file of files) {
      studio.upsertFile({ projectId, ...file });
    }
    for (const node of canvasNodes(canvas)) {
      studio.upsertNode({ projectId, ...node });
    }
    studio.createVersion({
      projectId,
      reason: `canvas:${reason}`,
      snapshotJson: canvasSnapshot(canvas),
      createdBy: "canvas-service"
    });
  }
}

function metadataString(metadata: Canvas["metadata"] | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function canvasProjectKind(kind: CanvasKind): CanvasProjectKind {
  if (kind === "ppt") return "deck";
  if (kind === "code") return "tool";
  if (kind === "app") return "app";
  if (kind === "diagram") return "diagram";
  if (kind === "chart") return "chart";
  return "document";
}

function canvasProjectEngine(kind: CanvasKind): CanvasProjectEngine {
  if (kind === "ppt") return "deck";
  if (kind === "app") return "prototype";
  if (kind === "code") return "tool";
  return "document";
}

function canvasFilePath(kind: CanvasKind): string {
  if (kind === "ppt") return "slides.md";
  if (kind === "app" || kind === "code") return "canvas.txt";
  return "canvas.md";
}

function canvasBlockNodes(canvas: Canvas) {
  const nodes: Array<{ id: string; parentId?: string; nodeType: string; orderIndex: number; contentJson: Record<string, unknown>; text?: string }> = [];
  const visit = (blocks: CanvasBlock[], parentId?: string) => {
    blocks.forEach((block, index) => {
      const id = `cnode:${canvas.id}:${block.id}`;
      nodes.push({
        id,
        ...(parentId ? { parentId } : {}),
        nodeType: block.type,
        orderIndex: index,
        contentJson: { attrs: block.attrs ?? {}, childCount: block.content?.length ?? 0 },
        ...(block.text !== undefined ? { text: block.text } : {})
      });
      if (block.content?.length) visit(block.content, id);
    });
  };
  visit(canvas.contentJson.blocks);
  return nodes;
}

function canvasNodes(canvas: Canvas) {
  if (canvas.kind === "ppt" && canvas.contentJson.deck) return canvas.contentJson.deck.slides.map((slide, index) => ({
    id: `cnode:${canvas.id}:${slide.id}`,
    nodeType: "slide",
    orderIndex: index,
    contentJson: {
      title: slide.title,
      layoutId: slide.layoutId,
      animation: slide.animation,
      notes: slide.notes ?? "",
      warningCount: canvas.contentJson.deck?.validation.warnings.length ?? 0
    },
    text: slide.visibleText
  }));
  return canvasBlockNodes(canvas);
}

function canvasSnapshot(canvas: Canvas): Record<string, unknown> {
  return {
    source: "canvas",
    canvas: {
      id: canvas.id,
      title: canvas.title,
      kind: canvas.kind,
      status: canvas.status,
      version: canvas.version,
      metadata: canvas.metadata ?? {}
    },
    contentJson: canvas.contentJson,
    contentText: canvas.contentText
  };
}

function actionPrefix(action: CanvasAiEditRequest["action"], instruction?: string) {
  const label: Record<CanvasAiEditRequest["action"], string> = {
    auto_layout: "自动排版",
    rewrite: "改写",
    expand: "扩写",
    shorten: "缩短",
    tone: "调整语气",
    translate: "翻译",
    outline: "生成目录",
    extract_table: "提取表格",
    to_chart: "转换为图表",
    to_diagram: "转换为流程图",
    fix_code: "修复代码",
    explain_code: "解释代码"
  };
  return instruction ? `${label[action]}：${instruction}` : label[action];
}
}

namespace __core_conversations_conversationStore {
import CardStore = __core_cards_cardStore.CardStore;
import ChatMessage = __ext_1.ChatMessage;
import Conversation = __ext_1.Conversation;
import CreateConversationRequest = __ext_1.CreateConversationRequest;
import UpdateConversationRequest = __ext_1.UpdateConversationRequest;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
const key = "conversations/conversations.json";

type Backend = StorageAdapter | WorkbenchDatabase | ConversationWorkspaceDatabase;

export class ConversationStore {
  constructor(
    private readonly backend: Backend,
    private readonly cards?: CardStore
  ) {}

  async list(): Promise<Conversation[]> {
    if (isDatabase(this.backend)) return this.backend.listConversations();
    const stored = await this.backend.readJson<Conversation[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return [...stored.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Conversation | undefined> {
    if (isDatabase(this.backend)) return this.backend.getConversation(id);
    return (await this.list()).find((conversation) => conversation.id === id);
  }

  async create(input: CreateConversationRequest = {}): Promise<Conversation> {
    if (isDatabase(this.backend)) {
      const conversation = this.backend.createConversation(input);
      this.cards?.syncConversation(conversation);
      return conversation;
    }
    const now = nowIso();
    const conversation: Conversation = {
      id: createId("conv"),
      title: input.title?.trim() || "New conversation",
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    await this.saveJson([conversation, ...(await this.list())]);
    return conversation;
  }

  async update(id: string, input: UpdateConversationRequest): Promise<Conversation> {
    if (isDatabase(this.backend)) {
      const conversation = this.backend.updateConversation(id, input);
      this.cards?.syncConversation(conversation);
      return conversation;
    }
    const conversations = await this.list();
    const index = conversations.findIndex((conversation) => conversation.id === id);
    if (index === -1) throw new Error("Conversation not found");
    const current = conversations[index]!;
    const updated = { ...current, title: input.title?.trim() || current.title, updatedAt: nowIso() };
    conversations[index] = updated;
    await this.saveJson(conversations);
    this.cards?.syncConversation(updated);
    return updated;
  }

  async appendMessages(id: string, messages: ChatMessage[]): Promise<Conversation> {
    if (isDatabase(this.backend)) {
      const conversation = this.backend.appendMessages(id, messages);
      this.cards?.syncConversation(conversation);
      return conversation;
    }
    const conversations = await this.list();
    const index = conversations.findIndex((conversation) => conversation.id === id);
    if (index === -1) throw new Error("Conversation not found");
    const current = conversations[index]!;
    const updated = { ...current, messages: [...current.messages, ...messages], updatedAt: nowIso() };
    conversations[index] = updated;
    await this.saveJson(conversations);
    this.cards?.syncConversation(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (isDatabase(this.backend)) {
      this.backend.deleteConversation(id);
      this.cards?.removeBySource("chat", id);
      return;
    }
    await this.saveJson((await this.list()).filter((conversation) => conversation.id !== id));
    this.cards?.removeBySource("chat", id);
  }

  private async saveJson(conversations: Conversation[]): Promise<void> {
    if (isDatabase(this.backend)) return;
    const stored = await this.backend.writeJsonAtomic(key, conversations);
    if (!stored.ok) throw new Error(stored.error.message);
  }
}

function isDatabase(value: Backend): value is WorkbenchDatabase | ConversationWorkspaceDatabase {
  return typeof (value as WorkbenchDatabase).listConversations === "function";
}
}

namespace __core_context_contextStore {
import ContextBlock = __ext_1.ContextBlock;
import isConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.isConversationWorkspaceStore;
import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
const key = "context/blocks.json";

export class ContextStore {
  constructor(private readonly storage: StorageAdapter | ConversationWorkspaceStore) {}

  async list(filter: { conversationId?: string | null } = {}): Promise<ContextBlock[]> {
    if (isConversationWorkspaceStore(this.storage)) {
      const workspace = this.storage;
      if (filter.conversationId !== undefined) return this.readBlocks(workspace.storageForConversation(filter.conversationId));
      const blocks = await Promise.all([...workspace.listManifests().map((manifest) => this.readBlocks(workspace.storageForConversation(manifest.id))), this.readBlocks(workspace.storageForConversation(null))]);
      return blocks.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    const stored = await this.storage.readJson<ContextBlock[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    const blocks = filter.conversationId !== undefined
      ? stored.value.filter((block) => (block.conversationId ?? null) === filter.conversationId)
      : stored.value;
    return [...blocks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<ContextBlock | undefined> {
    return (await this.list()).find((block) => block.id === id);
  }

  async create(input: Omit<ContextBlock, "id" | "createdAt" | "updatedAt" | "enabled"> & { enabled?: boolean }): Promise<ContextBlock> {
    const now = nowIso();
    const block: ContextBlock = { ...input, id: createId("ctx"), enabled: input.enabled ?? true, createdAt: now, updatedAt: now };
    const scope = input.conversationId ?? null;
    const blocks = await this.readScopedBlocks(scope);
    await this.save([block, ...blocks], scope);
    return block;
  }

  async update(id: string, patch: Partial<Pick<ContextBlock, "title" | "content" | "enabled" | "weight">>): Promise<ContextBlock> {
    const current = await this.get(id);
    if (!current) throw new Error("Context block not found");
    const scope = current.conversationId ?? null;
    const blocks = await this.readScopedBlocks(scope);
    const index = blocks.findIndex((block) => block.id === id);
    if (index === -1) throw new Error("Context block not found");
    const updated = { ...blocks[index]!, ...patch, updatedAt: nowIso() };
    blocks[index] = updated;
    await this.save(blocks, scope);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const current = await this.get(id);
    if (!current) return;
    const scope = current.conversationId ?? null;
    const blocks = await this.readScopedBlocks(scope);
    await this.save(blocks.filter((block) => block.id !== id), scope);
  }

  private async save(blocks: ContextBlock[], conversationId?: string | null): Promise<void> {
    if (isConversationWorkspaceStore(this.storage)) {
      const stored = await this.storage.storageForConversation(conversationId ?? null).writeJsonAtomic(key, blocks);
      if (!stored.ok) throw new Error(stored.error.message);
      return;
    }
    const stored = await this.storage.writeJsonAtomic(key, blocks);
    if (!stored.ok) throw new Error(stored.error.message);
  }

  private async readBlocks(storage: StorageAdapter): Promise<ContextBlock[]> {
    const stored = await storage.readJson<ContextBlock[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return stored.value;
  }

  private async readScopedBlocks(conversationId: string | null): Promise<ContextBlock[]> {
    if (isConversationWorkspaceStore(this.storage)) return this.readBlocks(this.storage.storageForConversation(conversationId));
    const stored = await this.storage.readJson<ContextBlock[]>(key, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return conversationId === null
      ? stored.value.filter((block) => block.conversationId === undefined || block.conversationId === null)
      : stored.value.filter((block) => block.conversationId === conversationId);
  }
}
}

namespace __core_tasks_taskStore {
import AiTask = __ext_1.AiTask;
import AiTaskEvent = __ext_1.AiTaskEvent;
import AiTaskStatus = __ext_1.AiTaskStatus;
import CreateTaskRequest = __ext_1.CreateTaskRequest;
import isConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.isConversationWorkspaceStore;
import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
import StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
const taskKey = "tasks.json";
const eventKey = "task-events.json";

export class TaskStore {
  constructor(private readonly storage: StorageAdapter | ConversationWorkspaceStore) {}

  async list(filter: { conversationId?: string | null } = {}): Promise<AiTask[]> {
    const tasks = filter.conversationId !== undefined && isConversationWorkspaceStore(this.storage)
      ? await this.readTasks(this.storageForConversationIfPresent(filter.conversationId))
      : await this.readAllTasks();
    return [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string, filter: { conversationId?: string | null } = {}): Promise<AiTask | undefined> {
    return (await this.list(filter)).find((task) => task.id === id);
  }

  async create(input: CreateTaskRequest): Promise<AiTask> {
    const now = nowIso();
    const task: AiTask = {
      id: createId("task"),
      type: input.type,
      status: "queued",
      title: input.title?.trim() || input.type,
      input: input.input ?? {},
      conversationId: input.conversationId ?? null,
      result: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null
    };
    this.requireConversationForTask(task);
    const storage = this.storageForTask(task);
    await this.saveTasks([task, ...(await this.readTasks(storage))], storage);
    this.touchConversationForTask(task);
    return task;
  }

  async updateStatus(id: string, status: AiTaskStatus, patch: Partial<AiTask> = {}, filter: { conversationId?: string | null } = {}): Promise<AiTask> {
    const task = await this.get(id, filter);
    if (!task) throw new Error("Task not found");
    const storage = this.storageForTask(task);
    const tasks = await this.readTasks(storage);
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) throw new Error("Task not found");
    const done = ["succeeded", "failed", "cancelled"].includes(status);
    const updated: AiTask = {
      ...tasks[index]!,
      ...patch,
      status,
      updatedAt: nowIso(),
      completedAt: done ? (patch.completedAt ?? nowIso()) : (patch.completedAt ?? null)
    };
    tasks[index] = updated;
    await this.saveTasks(tasks, storage);
    this.touchConversationForTask(updated);
    return updated;
  }

  async cancel(id: string, filter: { conversationId?: string | null } = {}): Promise<AiTask | undefined> {
    const task = await this.get(id, filter);
    if (!task || ["succeeded", "failed", "cancelled"].includes(task.status)) return undefined;
    await this.addEvent(id, { eventType: "cancelled", message: "Task cancelled." }, filter);
    return this.updateStatus(id, "cancelled", {}, filter);
  }

  async addEvent(taskId: string, input: { eventType: string; message: string; data?: Record<string, unknown> }, filter: { conversationId?: string | null } = {}): Promise<AiTaskEvent> {
    const event: AiTaskEvent = {
      id: createId("event"),
      taskId,
      eventType: input.eventType,
      message: input.message,
      ...(input.data === undefined ? {} : { data: input.data }),
      createdAt: nowIso()
    };
    const task = await this.get(taskId, filter);
    if (!task && filter.conversationId !== undefined) throw new Error("Task not found");
    const storage = task ? this.storageForTask(task) : this.defaultStorage();
    const events = await this.readEvents(storage);
    const stored = await storage.writeJsonAtomic(eventKey, [...events, event]);
    if (!stored.ok) throw new Error(stored.error.message);
    if (task) this.touchConversationForTask(task);
    return event;
  }

  async listEvents(taskId: string, filter: { conversationId?: string | null } = {}): Promise<AiTaskEvent[]> {
    const task = await this.get(taskId, filter);
    const events = task && isConversationWorkspaceStore(this.storage)
      ? await this.readEvents(this.storage.storageForConversation(task.conversationId))
      : await this.readAllEvents();
    return events.filter((event) => event.taskId === taskId);
  }

  private async readTasks(storage: StorageAdapter): Promise<AiTask[]> {
    const stored = await storage.readJson<AiTask[]>(taskKey, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return stored.value;
  }

  private async readAllTasks(): Promise<AiTask[]> {
    if (!isConversationWorkspaceStore(this.storage)) return this.readTasks(this.storage);
    const workspace = this.storage;
    const tasks = await Promise.all(workspace.listManifests().map((manifest) => this.readTasks(workspace.storageForConversation(manifest.id))));
    return tasks.flat();
  }

  private async readEvents(storage: StorageAdapter): Promise<AiTaskEvent[]> {
    const stored = await storage.readJson<AiTaskEvent[]>(eventKey, []);
    if (!stored.ok) throw new Error(stored.error.message);
    return stored.value;
  }

  private async readAllEvents(): Promise<AiTaskEvent[]> {
    if (!isConversationWorkspaceStore(this.storage)) return this.readEvents(this.storage);
    const workspace = this.storage;
    const events = await Promise.all(workspace.listManifests().map((manifest) => this.readEvents(workspace.storageForConversation(manifest.id))));
    return events.flat();
  }

  private async saveTasks(tasks: AiTask[], storage: StorageAdapter): Promise<void> {
    const stored = await storage.writeJsonAtomic(taskKey, tasks);
    if (!stored.ok) throw new Error(stored.error.message);
  }

  private storageForTask(task: AiTask): StorageAdapter {
    return isConversationWorkspaceStore(this.storage)
      ? this.storage.storageForConversation(task.conversationId)
      : this.storage;
  }

  private storageForConversationIfPresent(conversationId: string | null | undefined): StorageAdapter {
    if (!isConversationWorkspaceStore(this.storage)) return this.storage;
    if (conversationId && !this.storage.getManifest(conversationId)) return new EmptyJsonStorageAdapter();
    return this.storage.storageForConversation(conversationId);
  }

  private requireConversationForTask(task: AiTask): void {
    if (isConversationWorkspaceStore(this.storage) && task.conversationId) {
      this.storage.requireManifest(task.conversationId);
    }
  }

  private touchConversationForTask(task: Pick<AiTask, "conversationId">): void {
    if (isConversationWorkspaceStore(this.storage) && task.conversationId) {
      this.storage.touchConversation(task.conversationId);
    }
  }

  private defaultStorage(): StorageAdapter {
    return isConversationWorkspaceStore(this.storage)
      ? this.storage.storageForConversation(null)
      : this.storage;
  }
}

class EmptyJsonStorageAdapter implements StorageAdapter {
  async readJson<T>(_key: string, fallback: T) {
    return { ok: true as const, value: fallback };
  }

  async writeJsonAtomic<T>(_key: string, _value: T) {
    return { ok: true as const, value: undefined };
  }

  async delete(_key: string) {
    return { ok: true as const, value: undefined };
  }

  async list(_prefix: string) {
    return { ok: true as const, value: [] };
  }
}
}

namespace __core_methodology_autoReview {
import AiTask = __ext_1.AiTask;
import ContextStore = __core_context_contextStore.ContextStore;
import TaskStore = __core_tasks_taskStore.TaskStore;
export interface AutoReviewInput {
  goal: string;
  outcome: string;
  evidence?: string[] | undefined;
  issues?: string[] | undefined;
}

export class AutoReviewService {
  buildReport(input: AutoReviewInput): string {
    const evidence = input.evidence?.length ? input.evidence.join("\n- ") : "需要进一步确认更多外部证据。";
    const issues = input.issues?.length ? input.issues.join("\n- ") : "暂无已知阻塞；仍需保持验证记录。";
    return [
      "# 自动复盘",
      "",
      "## 原定目标",
      input.goal,
      "",
      "## 完成情况",
      input.outcome,
      "",
      "## 问题表",
      `- ${issues}`,
      "",
      "## 做得好的地方",
      `- 完整性：覆盖了目标和交付物。`,
      `- 正确性：保留了验证或证据线索。`,
      `- 方法论：先调查、再判断、再验证。`,
      `- 质量：输出结构化，后续可追踪。`,
      "",
      "## 下次重点关注",
      `- ${evidence}`
    ].join("\n");
  }

  async recordTask(input: { task: AiTask; taskStore: TaskStore; contextStore: ContextStore; outcome: string; evidence?: string[] }): Promise<string> {
    const report = this.buildReport({
      goal: input.task.title,
      outcome: input.outcome,
      evidence: input.evidence
    });
    await input.taskStore.addEvent(input.task.id, { eventType: "auto_review", message: "Auto-review generated.", data: { report } });
    await input.contextStore.create({
      conversationId: input.task.conversationId ?? null,
      sourceType: "task_result",
      channel: "auto_review",
      title: `复盘：${input.task.title}`,
      content: report,
      weight: 55,
      metadata: { taskId: input.task.id }
    });
    return report;
  }
}
}

namespace __core_context_contextLabels {
import ChatMessage = __ext_1.ChatMessage;
import ContextKind = __ext_1.ContextKind;
const affectPattern = /(焦虑|担心|难受|崩溃|沮丧|烦|怕|压力|安慰|陪陪|frustrated|anxious|worried|upset|overwhelmed)/i;
const humorPattern = /(哈哈|笑死|梗|玩笑|开玩笑|吐槽|整活|lol|lmao|joke|meme|funny)/i;
const metaPattern = /(设置|系统提示|工具状态|预算|缓存|token|上下文|system prompt|settings|budget|cache|context)/i;

export function classifyContextKind(message: Pick<ChatMessage, "role" | "content">): ContextKind {
  if (message.role === "system" || message.role === "tool") return "meta";
  const content = message.content ?? "";
  if (metaPattern.test(content)) return "meta";
  if (affectPattern.test(content)) return "affect";
  if (humorPattern.test(content)) return "humor";
  return "work";
}

export function withContextKind(message: ChatMessage): ChatMessage {
  return message.contextKind ? message : { ...message, contextKind: classifyContextKind(message) };
}

export function contextLabelPrompt(): string {
  return [
    "Context labeling policy:",
    "- work: concrete tasks, facts, code, plans, files, decisions, and tool outputs.",
    "- affect: emotional support, relationship tone, comfort, and durable style preferences.",
    "- humor: jokes, bits, memes, and light banter. Keep it short-term unless the user explicitly asks to remember it.",
    "- meta: system settings, tool state, budget, pricing, cache, and runtime status.",
    "Use work/meta for tool planning, file edits, budget decisions, and factual summaries. Respect affect naturally in tone. Let humor color replies lightly without polluting task summaries."
  ].join("\n");
}
}

namespace __core_core_contextManager {
import ChatMessage = __ext_1.ChatMessage;
import withContextKind = __core_context_contextLabels.withContextKind;
export interface ContextBudget {
  maxInputTokens: number;
  reserveOutputTokens: number;
  reserveToolTokens: number;
}

export const deepSeekV4ContextBudgetTokens = 1_000_000;
export const deepSeekV4MaxOutputTokens = 384_000;

export class ContextManager {
  prepareMessages(messages: ChatMessage[], budget: ContextBudget): ChatMessage[] {
    const system = messages.filter((message) => message.role === "system").map(withContextKind).map(compressMessage);
    const nonSystem = messages.filter((message) => message.role !== "system").map(withContextKind);
    const protectedIds = new Set<string>();
    for (const message of nonSystem) {
      if (message.role === "assistant" && message.tool_calls?.length) {
        protectedIds.add(message.id);
        for (const call of message.tool_calls) protectedIds.add(call.id);
      }
      if (message.role === "tool" && message.tool_call_id) protectedIds.add(message.tool_call_id);
    }
    const compressed = nonSystem.map((message) => protectedIds.has(message.id) || (message.tool_call_id && protectedIds.has(message.tool_call_id))
      ? shrinkToolResult(message)
      : compressMessage(message));
    const output = [...system, ...this.recentWithinBudget(this.dropShortTermHumor(compressed), budget, tokenEstimate(system))];
    return this.restoreToolChains(output, compressed, budget);
  }

  async prepareMessagesAsync(
    messages: ChatMessage[],
    budget: ContextBudget,
    counter: { countText(text: string): Promise<number> }
  ): Promise<ChatMessage[]> {
    const system = messages.filter((message) => message.role === "system").map(withContextKind).map(compressMessage);
    const nonSystem = messages.filter((message) => message.role !== "system").map(withContextKind);
    const prepared = this.prepareMessages([...system, ...nonSystem], { ...budget, maxInputTokens: Number.MAX_SAFE_INTEGER });
    const output = [...system, ...await this.recentWithinBudgetAsync(prepared.filter((message) => message.role !== "system"), budget, counter, await countMessagesTokens(system, counter))];
    return this.restoreToolChains(output, prepared.filter((message) => message.role !== "system"), budget);
  }

  private dropShortTermHumor(messages: ChatMessage[]): ChatMessage[] {
    const recentIds = new Set(messages.slice(-8).map((message) => message.id));
    return messages.filter((message) => message.contextKind !== "humor" || recentIds.has(message.id) || /璁颁綇|remember/i.test(message.content ?? ""));
  }

  private recentWithinBudget(messages: ChatMessage[], budget: ContextBudget, initialTokens = 0): ChatMessage[] {
    const limit = budget.maxInputTokens - budget.reserveOutputTokens - budget.reserveToolTokens;
    const kept: ChatMessage[] = [];
    let tokens = initialTokens;
    for (const message of [...messages].reverse()) {
      const next = messageTokenEstimate(message);
      if (tokens + next > limit && kept.length > 0) break;
      tokens += next;
      kept.push(message);
    }
    return kept.reverse();
  }

  private async recentWithinBudgetAsync(
    messages: ChatMessage[],
    budget: ContextBudget,
    counter: { countText(text: string): Promise<number> },
    initialTokens = 0
  ): Promise<ChatMessage[]> {
    const limit = budget.maxInputTokens - budget.reserveOutputTokens - budget.reserveToolTokens;
    const kept: ChatMessage[] = [];
    let tokens = initialTokens;
    for (const message of [...messages].reverse()) {
      const next = await countMessageTokens(message, counter);
      if (tokens + next > limit && kept.length > 0) break;
      tokens += next;
      kept.push(message);
    }
    return kept.reverse();
  }

  private restoreToolChains(output: ChatMessage[], source: ChatMessage[], budget: ContextBudget): ChatMessage[] {
    const byCallId = new Map<string, ChatMessage>();
    for (const message of source) {
      if (message.role === "tool" && message.tool_call_id) byCallId.set(message.tool_call_id, message);
    }
    const assistantCallIds = new Set<string>();
    for (const message of output) {
      if (message.role === "assistant") {
        for (const call of message.tool_calls ?? []) assistantCallIds.add(call.id);
      }
    }
    const merged = output.filter((message) => message.role !== "tool" || !message.tool_call_id || assistantCallIds.has(message.tool_call_id));
    const existingToolIds = new Set(merged.filter((message) => message.role === "tool").map((message) => message.tool_call_id).filter(Boolean));
    for (const message of output) {
      if (message.role !== "assistant" || !message.tool_calls?.length) continue;
      for (const call of message.tool_calls) {
        const toolMessage = byCallId.get(call.id);
        if (toolMessage && !existingToolIds.has(call.id)) {
          merged.push(toolMessage);
          existingToolIds.add(call.id);
        }
      }
    }
    return this.trimRestoredToolChains(merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), budget);
  }

  private trimRestoredToolChains(messages: ChatMessage[], budget: ContextBudget): ChatMessage[] {
    const limit = inputTokenLimit(budget);
    let current = dropIncompleteToolChains(messages);
    while (tokenEstimate(current) > limit) {
      const chainRoot = current.find((message) => message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0);
      if (!chainRoot?.tool_calls?.length) break;
      const callIds = new Set(chainRoot.tool_calls.map((call) => call.id));
      current = dropIncompleteToolChains(current.filter((message) => {
        if (message.id === chainRoot.id) return false;
        return message.role !== "tool" || !message.tool_call_id || !callIds.has(message.tool_call_id);
      }));
    }
    return current;
  }
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function countMessageTokens(message: ChatMessage, counter: { countText(text: string): Promise<number> }): Promise<number> {
  return await counter.countText(serializedMessageForBudget(message));
}

async function countMessagesTokens(messages: ChatMessage[], counter: { countText(text: string): Promise<number> }): Promise<number> {
  let total = 0;
  for (const message of messages) total += await countMessageTokens(message, counter);
  return total;
}

function tokenEstimate(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + messageTokenEstimate(message), 0);
}

function inputTokenLimit(budget: ContextBudget): number {
  return budget.maxInputTokens - budget.reserveOutputTokens - budget.reserveToolTokens;
}

function dropIncompleteToolChains(messages: ChatMessage[]): ChatMessage[] {
  const toolIds = new Set(messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id).filter(Boolean));
  const completeAssistantCallIds = new Set<string>();
  const droppedAssistantIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls?.length) continue;
    const complete = message.tool_calls.every((call) => toolIds.has(call.id));
    if (!complete) {
      droppedAssistantIds.add(message.id);
      continue;
    }
    for (const call of message.tool_calls) completeAssistantCallIds.add(call.id);
  }
  return messages.filter((message) => {
    if (droppedAssistantIds.has(message.id)) return false;
    return message.role !== "tool" || Boolean(message.tool_call_id && completeAssistantCallIds.has(message.tool_call_id));
  });
}

function messageTokenEstimate(message: ChatMessage): number {
  return estimateTextTokens(serializedMessageForBudget(message));
}

function serializedMessageForBudget(message: ChatMessage): string {
  return [
    message.role,
    message.contextKind ? `[context:${message.contextKind}]` : "",
    message.content ?? "",
    message.reasoning_content ?? "",
    message.tool_call_id ?? "",
    message.tool_calls?.length ? JSON.stringify(message.tool_calls) : ""
  ].join("\n");
}

function compressMessage(message: ChatMessage): ChatMessage {
  if ((message.content?.length ?? 0) > compressionLength(message.contextKind)) {
    return { ...message, content: summarizeLongText(message.content ?? "", message.contextKind ?? "work") };
  }
  return message;
}

function summarizeLongText(text: string, kind: string): string {
  const head = text.slice(0, 1200);
  const tail = text.slice(-600);
  return `[Long text compressed. contextKind=${kind}. Original length ${text.length}. Re-read source if exact details are needed.]\n${head}\n...\n${tail}`;
}

function shrinkToolResult(message: ChatMessage): ChatMessage {
  if (message.role !== "tool" || (message.content?.length ?? 0) <= 12000) return message;
  return { ...message, content: summarizeLongText(message.content ?? "", "meta") };
}

function compressionLength(kind: string | undefined): number {
  if (kind === "affect" || kind === "humor") return 1800;
  if (kind === "meta") return 5000;
  return 4000;
}
}

namespace __core_plans_planService {
import Artifact = __ext_1.Artifact;
import Canvas = __ext_1.Canvas;
import ModelName = __ext_1.ModelName;
import PricingCurrency = __ext_1.PricingCurrency;
import ThinkingConfig = __ext_1.ThinkingConfig;
import ArtifactManager = __core_core_artifactManager.ArtifactManager;
import deepSeekV4MaxOutputTokens = __core_core_contextManager.deepSeekV4MaxOutputTokens;
import estimateTextTokens = __core_core_contextManager.estimateTextTokens;
import LLMClient = __core_core_llmClient.LLMClient;
import CanvasService = __core_canvas_canvasService.CanvasService;
import inferCanvasKind = __core_canvas_canvasText.inferCanvasKind;
import buildPlanMethodology = __core_methodology_planContent.buildPlanMethodology;
import parsePlanMethodology = __core_methodology_planContent.parsePlanMethodology;
import renderPlanContent = __core_methodology_planContent.renderPlanContent;
import PlanMethodologyMetadata = __core_methodology_planContent.PlanMethodologyMetadata;
import MultiPassCoordinator = __core_methodology_multiPassCoordinator.MultiPassCoordinator;
import BudgetService = __core_usage_budget.BudgetService;
import UsageTracker = __core_usage_usageTracker.UsageTracker;
import compactTaskTitle = __core_utils_title.compactTaskTitle;
export interface PlanResult {
  title: string;
  content: string;
  metadata?: PlanMethodologyMetadata | undefined;
}

export interface PlanExecutionResult {
  artifact: Artifact;
  canvas: Canvas;
  summary: string;
}

export class PlanService {
  constructor(private readonly deps: {
    llm: LLMClient;
    artifactManager: ArtifactManager;
    canvasService: CanvasService;
    coordinator?: MultiPassCoordinator | undefined;
    executionModel?: ModelName | undefined;
    executionThinking?: ThinkingConfig | undefined;
    budgetService?: BudgetService | undefined;
    usageTracker?: UsageTracker | undefined;
  }) {}

  async generatePlan(prompt: string): Promise<PlanResult> {
    const title = compactTaskTitle(prompt, "执行方案");
    const metadata = buildPlanMethodology(prompt);
    return { title, content: renderPlanContent(title, prompt, metadata), metadata };
  }

  async executePlan(input: { title: string; plan: string; conversationId?: string | null; requestId?: string | undefined; currency?: PricingCurrency | undefined }): Promise<PlanExecutionResult> {
    const title = compactTaskTitle(input.title || input.plan, "执行方案");
    const parsed = parsePlanMethodology(input.plan);
    const coordinatorSummary = parsed.multiAngleSteps.length && this.deps.coordinator
      ? (await this.deps.coordinator.run({ goal: input.plan })).summary
      : "";
    const model = this.deps.executionModel ?? "deepseek-v4-flash";
    const thinking = this.deps.executionThinking ?? { type: "disabled" };
    const messages = [
      {
        id: "plan_executor_prompt",
        role: "user" as const,
        content: [
          "Execute this plan and return the final deliverable. Do not return another plan.",
          "",
          `Title: ${title}`,
          coordinatorSummary ? `\nMulti-angle analysis:\n${coordinatorSummary}` : "",
          parsed.primaryFocus ? `\nPrimary focus: ${parsed.primaryFocus}` : "",
          "",
          input.plan
        ].join("\n"),
        createdAt: new Date().toISOString()
      }
    ];
    const requestId = input.requestId ?? `plan_${Date.now()}`;
    const sessionId = input.conversationId ?? requestId;
    const currency = input.currency ?? "CNY";
    const estimatedCost = this.deps.usageTracker
      ? await this.deps.usageTracker.estimateWorstCaseCost({
        model,
        currency,
        promptTokens: messages.reduce((total, message) => total + estimateTextTokens(message.content ?? ""), 0),
        completionTokens: deepSeekV4MaxOutputTokens
      })
      : 0;
    await this.deps.budgetService?.ensureCanCall(sessionId, currency, estimatedCost);
    const response = await this.deps.llm.complete({ model, thinking, messages });
    if (response.usage) await this.deps.usageTracker?.record({ requestId, sessionId, model, currency, usages: [response.usage] });
    const content = response.message.content?.trim();
    if (!content) throw new Error("Plan execution produced no deliverable");
    const artifact = await this.deps.artifactManager.create({
      type: /<html|<!doctype/i.test(content) ? "html" : "markdown",
      title,
      content,
      metadata: { source: "plan.execute", conversationId: input.conversationId ?? null }
    });
    const canvas = await this.deps.canvasService.createFromText({
      conversationId: input.conversationId ?? null,
      title,
      kind: inferCanvasKind(content),
      text: content
    });
    return { artifact, canvas, summary: `Created ${canvas.title}` };
  }
}
}

namespace __core_plans_planStore {
import Plan = __ext_1.Plan;
import PlanStep = __ext_1.PlanStep;
import WorkflowType = __ext_1.WorkflowType;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import CardStore = __core_cards_cardStore.CardStore;
import isConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.isConversationWorkspaceDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
type PlanDatabase = WorkbenchDatabase | ConversationWorkspaceDatabase;

export class PlanStore {
  constructor(
    private readonly db: PlanDatabase,
    private readonly cards?: CardStore
  ) {}

  list(conversationId?: string | null): Plan[] {
    return this.db.listPlans(conversationId);
  }

  get(id: string, conversationId?: string | null): Plan | undefined {
    if (conversationId !== undefined && isConversationWorkspaceDatabase(this.db)) {
      const plan = this.db.dbForConversation(conversationId).getPlan(id);
      return plan?.conversationId === conversationId ? plan : undefined;
    }
    return this.db.getPlan(id);
  }

  create(input: {
    conversationId?: string | null;
    workflowType?: WorkflowType;
    phase?: Plan["phase"];
    primaryGoal: string;
    content: string;
    status?: Plan["status"];
    steps?: Array<Omit<PlanStep, "planId">>;
  }): Plan {
    const plan = this.db.createPlan({
      conversationId: input.conversationId ?? null,
      workflowType: input.workflowType ?? "new_project",
      phase: input.phase ?? "explore",
      primaryGoal: input.primaryGoal,
      content: input.content,
      status: input.status ?? "draft"
    });
    if (input.steps?.length) {
      this.db.replacePlanSteps(plan.id, input.steps);
    } else {
      this.db.replacePlanSteps(plan.id, defaultSteps(plan.id, plan.primaryGoal));
    }
    this.cards?.syncPlan(plan);
    return plan;
  }

  update(id: string, patch: Partial<{
    conversationId: string | null;
    workflowType: WorkflowType;
    phase: Plan["phase"];
    primaryGoal: string;
    content: string;
    status: Plan["status"];
  }>, conversationId?: string | null): Plan {
    const db = conversationId !== undefined && isConversationWorkspaceDatabase(this.db)
      ? this.db.dbForConversation(conversationId)
      : this.db;
    const plan = db.updatePlan(id, patch);
    this.cards?.syncPlan(plan);
    return plan;
  }

  delete(id: string): void {
    const plan = this.db.getPlan(id);
    this.db.deletePlan(id);
    if (plan) this.cards?.removeBySource("plan", plan.id);
  }

  listSteps(planId: string, conversationId?: string | null): PlanStep[] {
    if (conversationId !== undefined && isConversationWorkspaceDatabase(this.db)) {
      const plan = this.db.dbForConversation(conversationId).getPlan(planId);
      return plan?.conversationId === conversationId ? this.db.dbForConversation(conversationId).listPlanSteps(planId) : [];
    }
    return this.db.listPlanSteps(planId);
  }

  replaceSteps(planId: string, titles: string[], conversationId?: string | null): PlanStep[] {
    const existing = this.get(planId, conversationId);
    if (!existing) throw new Error("Plan not found");
    const now = nowIso();
    const steps = titles.map((title, index) => ({
      id: createId(`step_${index + 1}`),
      stepOrder: index + 1,
      title: title.trim(),
      status: "pending" as const,
      result: null,
      createdAt: now,
      updatedAt: now
    }));
    const db = conversationId !== undefined && isConversationWorkspaceDatabase(this.db)
      ? this.db.dbForConversation(conversationId)
      : this.db;
    return db.replacePlanSteps(planId, steps);
  }
}

function defaultSteps(planId: string, goal: string): Array<Omit<PlanStep, "planId">> {
  const now = nowIso();
  return [
    {
      id: createId(`${planId}_step_1`),
      stepOrder: 1,
      title: "明确目标和边界",
      status: "pending",
      result: null,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId(`${planId}_step_2`),
      stepOrder: 2,
      title: `围绕 ${goal.slice(0, 24) || "主目标"} 拆解执行路径`,
      status: "pending",
      result: null,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId(`${planId}_step_3`),
      stepOrder: 3,
      title: "完成后复盘并归档",
      status: "pending",
      result: null,
      createdAt: now,
      updatedAt: now
    }
  ];
}
}

namespace __core_tasks_taskProcessor {
import AiTask = __ext_1.AiTask;
import Canvas = __ext_1.Canvas;
import ArtifactManager = __core_core_artifactManager.ArtifactManager;
import CanvasService = __core_canvas_canvasService.CanvasService;
import inferCanvasKind = __core_canvas_canvasText.inferCanvasKind;
import ConversationStore = __core_conversations_conversationStore.ConversationStore;
import ContextStore = __core_context_contextStore.ContextStore;
import DeepResearchService = __core_research_deepResearchService.DeepResearchService;
import TaskStore = __core_tasks_taskStore.TaskStore;
import PlanService = __core_plans_planService.PlanService;
import PlanStore = __core_plans_planStore.PlanStore;
import AutoReviewService = __core_methodology_autoReview.AutoReviewService;
import compactTaskTitle = __core_utils_title.compactTaskTitle;
export class TaskProcessor {
  constructor(
    private readonly deps: {
      taskStore: TaskStore;
      deepResearch: DeepResearchService;
      planService: PlanService;
      artifactManager: ArtifactManager;
      canvasService: CanvasService;
      conversationStore: ConversationStore;
      contextStore: ContextStore;
      planStore?: PlanStore | undefined;
      autoReview?: AutoReviewService | undefined;
    }
  ) {}

  async process(taskId: string): Promise<AiTask> {
    const task = await this.deps.taskStore.get(taskId);
    if (!task) throw new Error("Task not found");
    if (task.status === "cancelled") return task;
    await this.deps.taskStore.updateStatus(task.id, "running");
    this.updatePlanStatus(task, "running");
    try {
      const result = task.type === "research.deep" ? await this.runResearch(task) : await this.runPlan(task);
      await this.deps.taskStore.addEvent(task.id, { eventType: "succeeded", message: "Task completed.", data: result });
      await this.recordReview(task, result);
      this.updatePlanStatus(task, "done");
      return this.deps.taskStore.updateStatus(task.id, "succeeded", { result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deps.taskStore.addEvent(task.id, { eventType: "failed", message });
      this.updatePlanStatus(task, "cancelled");
      return this.deps.taskStore.updateStatus(task.id, "failed", { errorMessage: message });
    }
  }

  private async runResearch(task: AiTask) {
    const query = String(task.input.query ?? task.title);
    const title = compactTaskTitle(query, "深度研究", "研究");
    let canvas: Canvas | undefined;
    await this.deps.taskStore.addEvent(task.id, { eventType: "researching", message: `Researching ${query}` });
    try {
      canvas = await this.deps.canvasService.create({
        conversationId: task.conversationId ?? null,
        title,
        kind: "document",
        status: "streaming",
        contentText: `# ${title}\n\n正在进行深度研究，完成后内容会在这里更新。`,
        taskId: task.id,
        metadata: { source: "research.deep", query }
      });
      await this.deps.taskStore.addEvent(task.id, { eventType: "canvas", message: "Canvas opened for research output.", data: { canvasId: canvas.id } });
    } catch {
      canvas = undefined;
    }
    const research = await this.deps.deepResearch.run({ query });
    const artifact = await this.deps.artifactManager.create({
      type: "markdown",
      title: research.title,
      content: research.content,
      metadata: {
        source: "research.deep",
        taskId: task.id,
        sources: research.sources,
        ...(task.conversationId ? { conversationId: task.conversationId } : {})
      }
    });
    const finalCanvas = canvas
      ? await this.deps.canvasService.update(canvas.id, {
          title: research.title,
          status: "ready",
          contentText: research.content,
          reason: "research.complete",
          metadata: { sources: research.sources }
        })
      : await this.deps.canvasService.createFromText({
          conversationId: task.conversationId ?? null,
          title: research.title,
          kind: "document",
          text: research.content,
          taskId: task.id
        });
    const context = await this.deps.contextStore.create({
      conversationId: task.conversationId ?? null,
      sourceType: "research_result",
      channel: "research",
      title: research.title,
      content: research.content,
      weight: 85,
      metadata: { taskId: task.id, artifactId: artifact.id, canvasId: finalCanvas.id, sources: research.sources }
    });
    if (task.conversationId) {
      await this.deps.conversationStore.appendMessages(task.conversationId, [
        {
          id: `taskmsg_${task.id}`,
          role: "assistant",
          content: `Deep research complete: ${research.title}`,
          createdAt: new Date().toISOString()
        }
      ]);
    }
    return { artifactId: artifact.id, canvasId: finalCanvas.id, contextBlockId: context.id, sources: research.sources };
  }

  private async runPlan(task: AiTask) {
    const plan = String(task.input.plan ?? "");
    await this.deps.taskStore.addEvent(task.id, { eventType: "generating", message: "Generating plan deliverable." });
    const result = await this.deps.planService.executePlan({
      title: task.title,
      plan,
      requestId: task.id,
      currency: task.input.currency === "USD" ? "USD" : "CNY",
      ...(task.conversationId === undefined ? {} : { conversationId: task.conversationId })
    });
    if (task.conversationId) {
      await this.deps.conversationStore.appendMessages(task.conversationId, [
        {
          id: `taskmsg_${task.id}`,
          role: "assistant",
          content: `Plan execution complete: ${result.summary}`,
          createdAt: new Date().toISOString()
        }
      ]);
    }
    return { artifactId: result.artifact.id, canvasId: result.canvas.id, summary: result.summary, kind: inferCanvasKind(result.canvas.contentText) };
  }

  private async recordReview(task: AiTask, result: Record<string, unknown>) {
    const review = this.deps.autoReview ?? new AutoReviewService();
    await review.recordTask({
      task,
      taskStore: this.deps.taskStore,
      contextStore: this.deps.contextStore,
      outcome: String(result.summary ?? "Task completed."),
      evidence: Object.entries(result).map(([key, value]) => `${key}=${String(value).slice(0, 120)}`)
    });
  }

  private updatePlanStatus(task: AiTask, status: "running" | "done" | "cancelled") {
    if (task.type !== "plan.execute") return;
    const planId = typeof task.input.planId === "string" ? task.input.planId : "";
    const conversationId = task.conversationId ?? undefined;
    if (!planId || !this.deps.planStore?.get(planId, conversationId)) return;
    this.deps.planStore.update(planId, { status }, conversationId);
  }
}
}

namespace __core_runtime_planTaskFactory {
import AppEnv = __core_config_env.AppEnv;
import ArtifactManager = __core_core_artifactManager.ArtifactManager;
import LLMClient = __core_core_llmClient.LLMClient;
import CanvasService = __core_canvas_canvasService.CanvasService;
import ConversationStore = __core_conversations_conversationStore.ConversationStore;
import ContextStore = __core_context_contextStore.ContextStore;
import AutoReviewService = __core_methodology_autoReview.AutoReviewService;
import MultiPassCoordinator = __core_methodology_multiPassCoordinator.MultiPassCoordinator;
import PlanService = __core_plans_planService.PlanService;
import PlanStore = __core_plans_planStore.PlanStore;
import DeepResearchService = __core_research_deepResearchService.DeepResearchService;
import TaskProcessor = __core_tasks_taskProcessor.TaskProcessor;
import TaskStore = __core_tasks_taskStore.TaskStore;
import BudgetService = __core_usage_budget.BudgetService;
import UsageTracker = __core_usage_usageTracker.UsageTracker;
interface RuntimePlanTaskDeps {
  env: Pick<AppEnv, "DEFAULT_MODEL" | "DEFAULT_THINKING" | "DEFAULT_REASONING_EFFORT">;
  llm: LLMClient;
  artifactManager: ArtifactManager;
  canvasService: CanvasService;
  coordinator: MultiPassCoordinator;
  budgetService: BudgetService;
  usageTracker: UsageTracker;
  taskStore: TaskStore;
  deepResearch: DeepResearchService;
  conversationStore: ConversationStore;
  contextStore: ContextStore;
  planStore: PlanStore;
  autoReview: AutoReviewService;
}

export function createRuntimePlanTask(deps: RuntimePlanTaskDeps) {
  const planService = new PlanService({
    llm: deps.llm,
    artifactManager: deps.artifactManager,
    canvasService: deps.canvasService,
    coordinator: deps.coordinator,
    executionModel: deps.env.DEFAULT_MODEL,
    executionThinking: deps.env.DEFAULT_THINKING === "enabled"
      ? { type: "enabled", reasoningEffort: deps.env.DEFAULT_REASONING_EFFORT }
      : { type: "disabled" },
    budgetService: deps.budgetService,
    usageTracker: deps.usageTracker
  });
  const taskProcessor = new TaskProcessor({
    taskStore: deps.taskStore,
    deepResearch: deps.deepResearch,
    planService,
    artifactManager: deps.artifactManager,
    canvasService: deps.canvasService,
    conversationStore: deps.conversationStore,
    contextStore: deps.contextStore,
    planStore: deps.planStore,
    autoReview: deps.autoReview
  });
  return { planService, taskProcessor };
}
}

namespace __core_core_mockLLMClient {
import ChatMessage = __ext_1.ChatMessage;
import LLMClient = __core_core_llmClient.LLMClient;
import LLMRequest = __core_core_llmClient.LLMRequest;
import LLMResponse = __core_core_llmClient.LLMResponse;
import LLMStreamDelta = __core_core_llmClient.LLMStreamDelta;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
export class MockLLMClient implements LLMClient {
  async complete(input: LLMRequest): Promise<LLMResponse> {
    const last = [...input.messages].reverse().find((message) => message.role === "user");
    const text = last?.content ?? "";
    const system = input.messages.filter((message) => message.role === "system").map((message) => message.content ?? "").join("\n");
    const message: ChatMessage = {
      id: createId("asst"),
      role: "assistant",
      content: mockAnswer(text, system),
      reasoning_content: input.thinking.type === "enabled" ? "Internal reasoning summary only for diagnostics." : null,
      createdAt: nowIso()
    };
    const prompt = input.messages.reduce((total, item) => total + Math.ceil((item.content ?? "").length / 4), 0);
    return {
      message,
      usage: {
        prompt_tokens: prompt,
        completion_tokens: Math.ceil((message.content ?? "").length / 4),
        total_tokens: prompt + Math.ceil((message.content ?? "").length / 4),
        prompt_cache_hit_tokens: Math.floor(prompt * 0.6),
        prompt_cache_miss_tokens: prompt - Math.floor(prompt * 0.6),
        completion_tokens_details: { reasoning_tokens: input.thinking.type === "enabled" ? Math.ceil((message.reasoning_content ?? "").length / 4) : 0 }
      }
    };
  }

  async *stream(input: LLMRequest): AsyncIterable<LLMStreamDelta> {
    const response = await this.complete(input);
    const content = response.message.content ?? "";
    for (const part of content.match(/.{1,18}/g) ?? []) {
      yield { content: part };
    }
    if (response.message.reasoning_content) yield { reasoning_content: response.message.reasoning_content };
    if (response.usage) yield { usage: response.usage };
  }
}

function mockAnswer(text: string, system = ""): string {
  if (/Coordinator context:/i.test(system)) {
    return system.split("Coordinator context:").at(-1)?.trim() ?? "综合结论";
  }
  if (/情绪回复策略/.test(system) && /(崩溃|烦死|受不了|搞不定|卡住|一直.{0,8}(修不好|不行|失败)|frustrated|stuck)/i.test(text)) {
    return "这确实很挫败。下一步：把第一个报错和复现步骤贴出来，我先帮你定位一个最小失败点。";
  }
  if (/情绪回复策略/.test(system) && /(焦虑|担心|害怕|紧张|怕.{0,8}(来不及|出错)|worr(?:y|ied)|anxious)/i.test(text)) {
    return "先收束到一件事：列出截止时间和必须交付物，我按优先级帮你排。";
  }
  if (/3000|技术方案|canvas|artifact|Canvas/i.test(text)) {
    return [
      "# DeepSeek V4 模块化 AI 助手技术方案",
      "",
      "## 架构",
      "采用 monorepo、Next App Router Route Handlers、core runtime、MCP server 和共享类型。",
      "",
      "| 模块 | 职责 |",
      "| --- | --- |",
      "| shared | 类型与协议 |",
      "| core | LLM、工具、记忆、Artifact |",
      "",
      "```ts",
      "export type ModelName = \"deepseek-v4-pro\" | \"deepseek-v4-flash\";",
      "```",
      "",
      "$$tokens = input + output$$",
      "",
      "该内容已放入 Canvas。"
    ].join("\n");
  }
  return `Mock streaming response: ${text || "hello"}`;
}
}

namespace __core_runtime_llmFactory {
import AppEnv = __core_config_env.AppEnv;
import DeepSeekLLMClient = __core_core_llmClient.DeepSeekLLMClient;
import MockLLMClient = __core_core_mockLLMClient.MockLLMClient;
type RuntimeLlmEnv = Pick<AppEnv, "DEEPSEEK_API_KEY" | "E2E_MOCK_LLM" | "E2E_MOCK_LLM_ALLOWED">;

export function createRuntimeLlm(env: RuntimeLlmEnv) {
  const useMockLlm = shouldUseMockLlm(env);
  const llm = useMockLlm
    ? new MockLLMClient()
    : new DeepSeekLLMClient({
        ...(env.DEEPSEEK_API_KEY ? { apiKey: env.DEEPSEEK_API_KEY } : {})
      });
  return { llm, useMockLlm };
}

export function shouldUseMockLlm(env: Pick<AppEnv, "E2E_MOCK_LLM" | "E2E_MOCK_LLM_ALLOWED">): boolean {
  return env.E2E_MOCK_LLM && env.E2E_MOCK_LLM_ALLOWED;
}
}

namespace __core_core_chatEngineOutput {
import Artifact = __ext_1.Artifact;
import Canvas = __ext_1.Canvas;
import ChatMessage = __ext_1.ChatMessage;
import ChatRequest = __ext_1.ChatRequest;
import ToolCall = __ext_1.ToolCall;
import truncate = __core_utils_id.truncate;
export interface CanvasStreamTarget {
  canvas: Canvas;
  buffer: string;
}

export function lastUser(request: ChatRequest): string {
  return [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

export function sessionId(request: ChatRequest): string {
  return request.conversationId ?? request.id;
}

export function shouldCreateDurableOutput(request: ChatRequest, content: string): boolean {
  const userText = lastUser(request);
  if (/(不要|不用|别|无需).{0,8}(canvas|画布|右侧|右边)|只在聊天|直接在聊天/i.test(userText)) return false;
  const requested = Boolean(request.canvasMode || request.artifactMode) || /canvas|artifact|技术方案|报告|长文|newspaper|文章|方案|申论|作文|论文|稿件|材料|公文/i.test(userText);
  return requested || content.trim().length >= 1200;
}

export function summarizeReasoning(reasoning?: string | null): string | undefined {
  if (!reasoning) return undefined;
  return truncate(reasoning.replace(/\s+/g, " "), 180);
}

export function withRepairedToolCalls(message: ChatMessage, calls: ToolCall[]): ChatMessage {
  if (calls.length) return { ...message, tool_calls: calls };
  const { tool_calls: _toolCalls, ...rest } = message;
  return rest;
}

export function summarizeArtifact(artifact: Artifact): string {
  return `已在 Canvas 中生成：${artifact.title}（${artifact.type}，v${artifact.version}）。`;
}

export function summarizeCanvas(canvas: Canvas): string {
  return `已在 Canvas 中生成：${canvas.title}（${canvas.kind}，v${canvas.version}）。`;
}
}

namespace __core_core_chatEngineBudget {
import ChatMessage = __ext_1.ChatMessage;
import ChatRequest = __ext_1.ChatRequest;
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import UsageSummary = __ext_1.UsageSummary;
import deepSeekV4ContextBudgetTokens = __core_core_contextManager.deepSeekV4ContextBudgetTokens;
import deepSeekV4MaxOutputTokens = __core_core_contextManager.deepSeekV4MaxOutputTokens;
import estimateTextTokens = __core_core_contextManager.estimateTextTokens;
import sessionId = __core_core_chatEngineOutput.sessionId;
import ToolRouter = __core_core_toolRouter.ToolRouter;
import BudgetService = __core_usage_budget.BudgetService;
import UsageTracker = __core_usage_usageTracker.UsageTracker;
interface BudgetGuardDeps {
  budgetService?: Pick<BudgetService, "ensureCanCall"> | undefined;
  tokenCounter?: { countText(text: string): Promise<number> } | undefined;
  usageTracker?: Pick<UsageTracker, "estimateWorstCaseCost" | "preview"> | undefined;
}

export function chatCompactionBudget(toolRouter: ToolRouter) {
  const toolSchemaReserve = estimateTextTokens(JSON.stringify(toolRouter.listModelTools()));
  return {
    maxInputTokens: deepSeekV4ContextBudgetTokens,
    reserveOutputTokens: deepSeekV4MaxOutputTokens,
    reserveToolTokens: Math.max(24000, toolSchemaReserve)
  };
}

export async function countMessagesForBudget(
  messages: ChatMessage[],
  tokenCounter?: { countText(text: string): Promise<number> } | undefined
): Promise<number> {
  if (!tokenCounter) {
    return messages.reduce((total, message) => total + estimateTextTokens(serializeMessageForBudget(message)), 0);
  }
  let total = 0;
  for (const message of messages) total += await tokenCounter.countText(serializeMessageForBudget(message));
  return total;
}

export async function ensureBudgetForChatRequest(request: ChatRequest, deps: BudgetGuardDeps, accruedTurnCost = 0): Promise<void> {
  if (!deps.budgetService) return;
  const estimatedCost = deps.usageTracker
    ? await deps.usageTracker.estimateWorstCaseCost({
        model: request.model,
        currency: request.currency,
        promptTokens: await countMessagesForBudget(request.messages, deps.tokenCounter),
        completionTokens: deepSeekV4MaxOutputTokens
      })
    : 0;
  await deps.budgetService.ensureCanCall(sessionId(request), request.currency, accruedTurnCost + estimatedCost);
}

export async function turnUsageCost(
  request: ChatRequest,
  usages: DeepSeekRawUsage[],
  deps: Pick<BudgetGuardDeps, "usageTracker">
): Promise<number> {
  if (!deps.usageTracker || !usages.length) return 0;
  const summary = await deps.usageTracker.preview({ sessionId: sessionId(request), model: request.model, currency: request.currency, usages }) as UsageSummary | undefined;
  return summary?.turn.cost ?? 0;
}

export function serializeMessageForBudget(message: ChatMessage): string {
  return [
    message.role,
    message.contextKind ? `[context:${message.contextKind}]` : "",
    message.content ?? "",
    message.reasoning_content ?? "",
    message.tool_call_id ?? "",
    message.tool_calls?.length ? JSON.stringify(message.tool_calls) : ""
  ].join("\n");
}
}

namespace __core_memory_memoryPolicy {
import MemoryCandidate = __ext_1.MemoryCandidate;
import createId = __core_utils_id.createId;
const sensitive = /(password|api key|secret|token|health|medical|finance|legal|身份证|密码|密钥|病历|财务)/i;

export class MemoryPolicy {
  extractCandidates(text: string, source: string): MemoryCandidate[] {
    if (!/(remember|记住|以后|preference|偏好)/i.test(text)) return [];
    if (sensitive.test(text)) return [];
    return [
      {
        id: createId("memcand"),
        content: text.slice(0, 500),
        source,
        confidence: 0.7,
        tags: ["user-confirmation-required"],
        reason: "User wording suggests a durable preference or fact."
      }
    ];
  }
}
}

namespace __core_core_chatEngineMemory {
import ChatRequest = __ext_1.ChatRequest;
import MemoryCandidate = __ext_1.MemoryCandidate;
import MemoryPolicy = __core_memory_memoryPolicy.MemoryPolicy;
import MemoryStore = __core_memory_memoryStore.MemoryStore;
import lastUser = __core_core_chatEngineOutput.lastUser;
interface ChatMemoryDeps {
  memoryPolicy: Pick<MemoryPolicy, "extractCandidates">;
  memoryStore: Pick<MemoryStore, "addCandidate">;
}

export async function persistMemoryCandidates(request: ChatRequest, deps: ChatMemoryDeps): Promise<MemoryCandidate[]> {
  const candidates = deps.memoryPolicy.extractCandidates(lastUser(request), request.id);
  for (const candidate of candidates) await deps.memoryStore.addCandidate(candidate, { conversationId: request.conversationId ?? null });
  return candidates;
}
}

namespace __core_context_promptSnapshot {
import createHash = __ext_0.createHash;
import ModelToolSchema = __core_core_llmClient.ModelToolSchema;
export interface PromptSnapshot {
  hash: string;
  prompt: string;
}

export function createPromptSnapshot(systemPrompt: string, tools: ModelToolSchema[]): PromptSnapshot {
  const stablePayload = JSON.stringify({
    systemPrompt,
    tools: [...tools]
      .sort((left, right) => left.function.name.localeCompare(right.function.name))
      .map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }))
  });
  const hash = createHash("sha256").update(stablePayload).digest("hex");
  return { hash, prompt: systemPrompt };
}
}

namespace __core_methodology_coreDisciplines {

export const coreDisciplines = [
  "核心纪律：",
  "1. 无事实不判断：每个结论必须附具体依据，说明读了什么、看到了什么或运行出了什么。",
  "2. 未验证不完成：声称完成前必须执行验证动作，运行、对比预期并检查输出。",
  "3. 不确定就标注：遇到信息缺口时明确说明需要进一步确认，不用猜测代替调查。",
  "4. 遇阻必探因：失败时说明原因并换路径，不在第一次遇阻时停止。"
].join("\n");

export const thinkingMethodPrompt = [
  "复杂分析使用约束框架：识别对立或制约因素，判定主要矛盾，区分必须取舍与可以调和的问题。",
  "检查关键关系是否被片面处理，并给出可验证路径。"
].join("\n");

export const planningMethodPrompt = [
  "计划时先判断任务类型：新项目启动、疑难攻坚、迭代优化。",
  "计划必须包含阶段标记、优先级矩阵、唯一主攻目标和验证动作；建议多角度分析的步骤用中性标记说明。"
].join("\n");

export const codingMethodPrompt = [
  "代码生成后进入快速验证：编译或语法检查、运行一次、如有相关测试则运行测试。",
  "失败时分析原因并最多自动修正 2 次；仍失败则停止并报告错误摘要和下一步建议。"
].join("\n");
}

namespace __core_core_promptSections {

export type SectionPriority = "static" | "snapshot" | "policy" | "dynamic";

export interface PromptSection {
  id: string;
  title?: string;
  body: string;
  priority?: SectionPriority;
  order?: number;
  hidden?: boolean;
}

export interface ComposePromptSectionOptions {
  separator?: string;
  includeUntitledSections?: boolean;
}

const PRIORITY_RANK: Record<SectionPriority, number> = {
  static: 0,
  snapshot: 1,
  policy: 2,
  dynamic: 3
};

export function composePromptSections(
  sections: readonly PromptSection[],
  options: ComposePromptSectionOptions = {}
): string {
  const separator = options.separator ?? "\n\n";
  return [...sections]
    .filter((section) => !section.hidden && section.body.trim().length > 0)
    .sort(comparePromptSections)
    .map((section) => renderPromptSection(section, options))
    .join(separator)
    .trim();
}

export function renderPromptSection(
  section: PromptSection,
  options: ComposePromptSectionOptions = {}
): string {
  const body = section.body.trim();
  if (!section.title && !options.includeUntitledSections) return body;

  return [`## ${section.title ?? section.id}`, body].join("\n\n");
}

export function comparePromptSections(left: PromptSection, right: PromptSection): number {
  const priority = PRIORITY_RANK[left.priority ?? "dynamic"] - PRIORITY_RANK[right.priority ?? "dynamic"];
  if (priority !== 0) return priority;

  const order = (left.order ?? 0) - (right.order ?? 0);
  if (order !== 0) return order;

  return left.id.localeCompare(right.id);
}
}

namespace __core_core_promptManager {
import AppMode = __ext_1.AppMode;
import CapabilityContext = __ext_1.CapabilityContext;
import EmotionLabel = __ext_1.EmotionLabel;
import contextLabelPrompt = __core_context_contextLabels.contextLabelPrompt;
import codingMethodPrompt = __core_methodology_coreDisciplines.codingMethodPrompt;
import coreDisciplines = __core_methodology_coreDisciplines.coreDisciplines;
import planningMethodPrompt = __core_methodology_coreDisciplines.planningMethodPrompt;
import thinkingMethodPrompt = __core_methodology_coreDisciplines.thinkingMethodPrompt;
import composePromptSections = __core_core_promptSections.composePromptSections;
//============================ 基础提示词 ========================
const basePrompt = [
  "回答要精简、清晰、直接，除非用户另有要求，不要提供过多额外信息。且只回答用户的核心问题，不要过多展开",
  coreDisciplines,
  "Use tools only through the provided tool call interface.",
  contextLabelPrompt(),
  "Never permanently save private information without explicit user confirmation."
].join("\n");

//============================ 安全提示词 ========================
const safetyPrompt = [
  "Do not place hidden reasoning in the final answer; DeepSeek reasoning_content is displayed separately by the app when DeepSeek returns it.",
  "When code execution is needed, call the local_restricted_runner tool only if enabled.",
  "For long durable content, create or update an artifact and summarize in chat.",
  "For current time, today, date, or Beijing time questions, use current_time before answering.",
  "For DeepSeek official news or announcements, use deepseek_official_news and cite official URLs.",
  "Do not treat search snippets, forums, or third-party pages as official DeepSeek news.",
  "For latest/current web information, use web_search or web_fetch when web access is enabled.",
  "Do not claim you cannot access current information before trying the available tools.",
  "Never print raw tool invocation markup such as <invoke> or XML-like tool calls in the final answer.",
  "If all web tools fail, say the web lookup failed and include the tool error summaries instead of inventing results."
].join("\n");

const modePrompts: Record<AppMode, string> = {
  chat: "",
  thinking: "Handle complex reasoning tasks. Keep final answers clear and concise.",
  writing: "Produce polished writing. Long outputs belong in artifacts.",
  teaching: "Teach step by step, ask short checks, use examples and counterexamples.",
  planning: "Plan before executing. Each step needs input, output, and tool dependency.",
  coding: "Analyze code rigorously, propose testable fixes, and use tools through toolRouter.",
  "multi-agent": "Coordinate specialist agents with bounded rounds and summarize tradeoffs."
};

export class PromptManager {
  getStableSystemPrompt(_input?: AppMode | CapabilityContext, _artifactMode = false): string {
    return composePromptSections([
      { id: "base", title: "Base", body: basePrompt, priority: "static", order: 0 },
      { id: "safety", title: "Safety", body: safetyPrompt, priority: "policy", order: 0 }
    ]);
  }

  getSystemPrompt(input: AppMode | CapabilityContext, artifactMode = false, extraContext = ""): string {
    const dynamic = this.getDynamicSystemPrompt(input, artifactMode, extraContext);
    return [this.getStableSystemPrompt(input, artifactMode), dynamic].filter(Boolean).join("\n\n");
  }

  getDynamicSystemPrompt(input: AppMode | CapabilityContext, artifactMode = false, extraContext = ""): string {
    const ctx = typeof input === "string" ? legacyContext(input) : input;
    const parts = [
      modePrompts[ctx.modePreference],
      ctx.flags.thinking ? thinkingMethodPrompt : "",
      ctx.flags.coding ? codingMethodPrompt : "",
      ctx.flags.multiAgent ? "启用多角度分析：比较约束、风险、取舍和验证路径，再形成最终结论。" : "",
      ctx.flags.canvas || artifactMode ? "The user requested or implied Canvas/Artifact output when appropriate. Put long durable content in Canvas and summarize in chat." : "",
      ctx.flags.canvas ? deckPrompt(ctx) : "",
      ctx.flags.deepResearch ? "For broad research tasks, synthesize gathered evidence and distinguish confirmed facts from gaps." : "",
      ctx.flags.webSearch ? "Use available web tools before answering current or source-dependent questions." : "",
      ctx.flags.teaching ? "教学策略：不要进入任务计划；先问用户已知什么或卡在哪里，再基于其现有理解用短步骤、例子和一个检查问题推进。" : "",
      emotionPrompt(ctx.emotion),
      ctx.modePreference === "planning" ? planningMethodPrompt : "",
      `Workflow hint: ${ctx.workflow.label}; Phase hint: ${ctx.phase.label}.`,
      extraContext ? `Coordinator context:\n${extraContext}` : ""
    ];
    return [...new Set(parts)]
      .filter(Boolean)
      .join("\n\n");
  }
}

function legacyContext(mode: AppMode): CapabilityContext {
  return {
    workflow: { type: "troubleshooting", label: "疑难攻坚", reason: "Legacy prompt request." },
    phase: { type: "explore", label: "探索积累", reason: "Legacy prompt request." },
    flags: {
      multiAgent: mode === "multi-agent",
      coding: mode === "coding",
      webSearch: false,
      deepResearch: false,
      canvas: mode === "writing",
      thinking: mode === "thinking",
      teaching: mode === "teaching"
    },
    emotion: null,
    primaryGoal: "",
    reasons: [],
    modePreference: mode
  };
}

function emotionPrompt(emotion: EmotionLabel | null): string {
  if (!emotion) return "";
  if (emotion.state === "frustrated") {
    return "情绪回复策略：先承认用户的挫败感，再用一个可执行的下一步降低摩擦；不要责备用户，也不要展开长篇泛泛安慰。";
  }
  if (emotion.state === "anxious") {
    return "情绪回复策略：先降低不确定性，给出短、确定、可排序的行动项；避免制造更多待办压力。";
  }
  return "情绪回复策略：用户表达紧急时先给最短可执行路径，再说明后续补充项；优先清晰和速度。";
}

function deckPrompt(ctx: CapabilityContext): string {
  if (!/(ppt|slides?|deck|幻灯片|演示文稿)/i.test(ctx.primaryGoal)) return "";
  return [
    "PPT/Deck Canvas contract:",
    "Target an html-ppt static deck structure.",
    "Canvas must contain audience-facing slide content only.",
    "Do not put execution plans, process narration, or phrases like 'first I will' / 'next I will' into visible slides.",
    "The Plan card is the dedicated place for plan/process content.",
    "Use one `.slide` per logical page, with hidden `aside.notes` for speaker/script/narration text.",
    "Assume the deck runtime will wire `assets/fonts.css`, `assets/base.css`, `assets/animations/animations.css`, `assets/runtime.js`, `assets/animations/fx-runtime.js`, and a `theme-link` stylesheet.",
    "Use varied slide structures based on content; do not force every page into title plus three bullets.",
    "Use template-derived layouts such as cover, KPI grid, comparison, timeline, process steps, table, two-column, quote, and thanks when the content calls for them.",
    "Do not repeat the same slide body or layout across consecutive pages unless the source content truly requires it.",
    "Speaker-only notes belong in hidden notes, not visible slide text."
  ].join(" ");
}
}

namespace __core_core_chatEngineRequest {
import CapabilityContext = __ext_1.CapabilityContext;
import ChatMessage = __ext_1.ChatMessage;
import ChatRequest = __ext_1.ChatRequest;
import withContextKind = __core_context_contextLabels.withContextKind;
import createPromptSnapshot = __core_context_promptSnapshot.createPromptSnapshot;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import chatCompactionBudget = __core_core_chatEngineBudget.chatCompactionBudget;
import ContextManager = __core_core_contextManager.ContextManager;
import PromptManager = __core_core_promptManager.PromptManager;
import ToolRouter = __core_core_toolRouter.ToolRouter;
interface ChatRequestPreparationDeps {
  contextManager: ContextManager;
  promptManager: PromptManager;
  toolRouter: ToolRouter;
  tokenCounter?: { countText(text: string): Promise<number> } | undefined;
}

export async function prepareChatRequest(
  request: ChatRequest,
  capability: CapabilityContext,
  deps: ChatRequestPreparationDeps,
  extraContext = ""
): Promise<ChatRequest> {
  const system = {
    id: createId("sys_prompt"),
    role: "system" as const,
    content: "",
    contextKind: "meta" as const,
    createdAt: nowIso()
  };
  const snapshot = createPromptSnapshot(deps.promptManager.getStableSystemPrompt(), deps.toolRouter.listModelTools());
  system.content = `${snapshot.prompt}\n\nPrompt snapshot hash: ${snapshot.hash.slice(0, 16)}`;
  const messages = [
    system,
    ...dynamicMessages(request, capability, deps.promptManager, extraContext),
    ...request.messages
      .filter((message) => !(message.role === "system" && (message.id.startsWith("sys_prompt") || message.id.startsWith("sys_dynamic"))))
      .map(withContextKind)
  ];
  return { ...request, messages: await compactChatMessages(messages, deps) };
}

export function compactChatMessages(messages: ChatMessage[], deps: ChatRequestPreparationDeps): Promise<ChatMessage[]> | ChatMessage[] {
  const budget = chatCompactionBudget(deps.toolRouter);
  return deps.tokenCounter
    ? deps.contextManager.prepareMessagesAsync(messages, budget, deps.tokenCounter)
    : deps.contextManager.prepareMessages(messages, budget);
}

function dynamicMessages(request: ChatRequest, capability: CapabilityContext, promptManager: PromptManager, extraContext: string): ChatMessage[] {
  const turnPrompt = promptManager.getDynamicSystemPrompt(capability, request.artifactMode);
  const content = extraContext
    ? `Dynamic context:\n${turnPrompt}\n\nCoordinator context:\n${extraContext}`
    : turnPrompt
    ? `Dynamic context:\n${turnPrompt}`
    : "";
  return content ? [{ id: createId("sys_dynamic"), role: "system", content, contextKind: "meta", createdAt: nowIso() }] : [];
}
}

namespace __core_core_chatEngineToolLoop {
import ToolCall = __ext_1.ToolCall;
import truncate = __core_utils_id.truncate;
export function chunkToolCalls(calls: ToolCall[], isParallelSafe: (name: string) => boolean): ToolCall[][] {
  const chunks: ToolCall[][] = [];
  let parallel: ToolCall[] = [];
  for (const call of calls) {
    if (isParallelSafe(call.function.name)) {
      parallel.push(call);
      continue;
    }
    if (parallel.length) {
      chunks.push(parallel);
      parallel = [];
    }
    chunks.push([call]);
  }
  if (parallel.length) chunks.push(parallel);
  return chunks;
}

export function remainingToolExecutions(maxToolErrors: number, errors: number): number {
  return Math.max(1, maxToolErrors - errors + 1);
}

export function sanitizeToolArguments(args: string): string {
  return truncate(args.replace(/"[^"]*(key|token|secret|password)[^"]*"\s*:\s*"[^"]*"/gi, '"$1":"***"'));
}
}

namespace __core_core_chatPreflight {
import CapabilityContext = __ext_1.CapabilityContext;
import ChatRequest = __ext_1.ChatRequest;
import ToolCallState = __ext_1.ToolCallState;
import ToolRouter = __core_core_toolRouter.ToolRouter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
export async function preflightChat(request: ChatRequest, toolRouter: ToolRouter, capability?: CapabilityContext | undefined): Promise<{ request: ChatRequest; toolCalls: ToolCallState[] }> {
  const calls = plannedCalls(request, capability);
  if (!calls.length) return { request, toolCalls: [] };
  const toolCalls: ToolCallState[] = [];
  const systemMessages = [];
  for (const planned of calls) {
    const call = { id: createId("call"), type: "function" as const, function: planned };
    const startedAt = nowIso();
    const result = await toolRouter.executeTool(call, { requestId: request.id, conversationId: request.conversationId ?? null });
    toolCalls.push({
      id: call.id,
      toolName: planned.name,
      inputSummary: planned.summary,
      status: result.ok ? "success" : "error",
      startedAt,
      finishedAt: nowIso(),
      durationMs: Date.now() - Date.parse(startedAt),
      resultSummary: result.summary,
      error: result.error?.message
    });
    systemMessages.push({
      id: createId("sys"),
      role: "system" as const,
      content: `${planned.name} tool result: ${result.content}`,
      createdAt: nowIso()
    });
  }
  return { request: { ...request, messages: [...request.messages, ...systemMessages] }, toolCalls };
}

function plannedCalls(request: ChatRequest, capability?: CapabilityContext | undefined) {
  const text = lastUser(request);
  const calls: { name: string; arguments: string; summary: string }[] = [];
  if (/(现在|当前|今天|北京|几点|日期|time|date|today|now)/i.test(text)) {
    calls.push({
      name: "current_time",
      arguments: JSON.stringify({ timeZone: "Asia/Shanghai", locale: "zh-CN" }),
      summary: "Asia/Shanghai"
    });
  }
  if (/deepseek/i.test(text) && /(官方|新闻|公告|news|announcement|latest|最新|今天)/i.test(text)) {
    calls.push({ name: "deepseek_official_news", arguments: JSON.stringify({ limit: 10 }), summary: "official DeepSeek news" });
  }
  if (capability?.flags.webSearch && !calls.some((call) => call.name === "deepseek_official_news")) {
    calls.push({ name: "web_search", arguments: JSON.stringify({ query: text, maxResults: 5 }), summary: "intent web search" });
  }
  const files = request.files ?? [];
  if (files.length && /(文件|附件|图片|图像|识别|读取|总结|分析|看一下|看图|ocr|image|file|attachment)/i.test(text)) {
    for (const file of files.slice(-3)) {
      calls.push({ name: "file_reader", arguments: JSON.stringify({ fileId: file.id }), summary: file.name });
    }
  }
  return calls;
}

function lastUser(request: ChatRequest): string {
  return [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}
}

namespace __core_methodology_codingVerification {
import CodeExecutionResult = __ext_1.CodeExecutionResult;
import AppEnv = __core_config_env.AppEnv;
import runLocalRestricted = __core_tools_codeExecutionTool.runLocalRestricted;
export interface VerificationAttempt {
  index: number;
  result: CodeExecutionResult;
}

export interface VerificationResult {
  status: "passed" | "failed" | "skipped";
  report: string;
  attempts: VerificationAttempt[];
}

export interface VerificationHooks {
  runCode?: ((input: { language: "javascript" | "typescript"; code: string }) => Promise<CodeExecutionResult>) | undefined;
  repairCode?: ((code: string, attempt: VerificationAttempt) => string) | undefined;
}

export class CodeVerificationService {
  constructor(
    private readonly env: Pick<AppEnv, "CODE_EXECUTION_ENABLED" | "CODE_EXECUTION_TIMEOUT_MS">,
    private readonly hooks: VerificationHooks = {}
  ) {}

  async verify(content: string): Promise<VerificationResult> {
    const block = extractRunnableBlock(content);
    if (!block) return { status: "skipped", attempts: [], report: "## 验证\n未发现可自动运行的 JS/TS 代码块。" };
    if (!this.env.CODE_EXECUTION_ENABLED) {
      return { status: "skipped", attempts: [], report: "## 验证\n本地受限运行器配置禁用，无法自动执行代码。" };
    }
    const attempts: VerificationAttempt[] = [];
    let code = block.code;
    for (let index = 1; index <= 3; index += 1) {
      const result = await this.run({ language: block.language, code });
      const attempt = { index, result };
      attempts.push(attempt);
      if (result.exitCode === 0 && !result.timedOut) return { status: "passed", attempts, report: renderReport("passed", attempts) };
      if (index < 3) code = this.hooks.repairCode?.(code, attempt) ?? code;
    }
    return { status: "failed", attempts, report: renderReport("failed", attempts) };
  }

  private run(input: { language: "javascript" | "typescript"; code: string }) {
    return this.hooks.runCode?.(input) ?? runLocalRestricted(input, this.env);
  }
}

function extractRunnableBlock(content: string): { language: "javascript" | "typescript"; code: string } | undefined {
  const match = content.match(/```(js|javascript|ts|typescript)\s*([\s\S]*?)```/i);
  if (!match) return undefined;
  const language = /ts|typescript/i.test(match[1] ?? "") ? "typescript" : "javascript";
  return { language, code: match[2] ?? "" };
}

function renderReport(status: "passed" | "failed", attempts: VerificationAttempt[]): string {
  const last = attempts.at(-1);
  const lines = [
    "## 验证",
    status === "passed" ? "快速验证通过。" : "快速验证失败，已达到最多自动修正 2 次的上限。",
    ...attempts.map((attempt) => `- 第 ${attempt.index} 次：exitCode=${attempt.result.exitCode}, timedOut=${attempt.result.timedOut}`),
    last?.result.stdout ? `stdout:\n${last.result.stdout}` : "",
    last?.result.stderr ? `stderr:\n${last.result.stderr}` : ""
  ];
  return lines.filter(Boolean).join("\n");
}
}

namespace __core_core_chatMethodology {
import CapabilityContext = __ext_1.CapabilityContext;
import ChatRequest = __ext_1.ChatRequest;
import ToolCallState = __ext_1.ToolCallState;
import ContextStore = __core_context_contextStore.ContextStore;
import AutoReviewService = __core_methodology_autoReview.AutoReviewService;
import CodeVerificationService = __core_methodology_codingVerification.CodeVerificationService;
import MultiPassCoordinator = __core_methodology_multiPassCoordinator.MultiPassCoordinator;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import truncate = __core_utils_id.truncate;
export interface ChatMethodologyDeps {
  coordinator?: MultiPassCoordinator | undefined;
  codingVerification?: CodeVerificationService | undefined;
  autoReview?: AutoReviewService | undefined;
  contextStore?: ContextStore | undefined;
}

export interface CoordinatorPromptContext {
  summary: string;
  reasoningSummary: string;
}

export async function coordinatorPromptContext(
  request: ChatRequest,
  capability: CapabilityContext,
  deps: ChatMethodologyDeps
): Promise<CoordinatorPromptContext | undefined> {
  if (!capability.flags.multiAgent || !deps.coordinator) return undefined;
  const goal = capability.primaryGoal || lastUser(request);
  const result = await deps.coordinator.run({ goal });
  if (request.conversationId && deps.contextStore && deps.autoReview) {
    const report = deps.autoReview.buildReport({ goal, outcome: result.summary, evidence: result.events.map((event) => event.role) });
    await deps.contextStore.create({
      conversationId: request.conversationId,
      sourceType: "task_result",
      channel: "auto_review",
      title: "多角度分析复盘",
      content: report,
      weight: 50,
      metadata: { source: "multi_agent" }
    });
  }
  return { summary: result.summary, reasoningSummary: "Multi-pass synthesis completed." };
}

export async function verifyCodingContent(
  request: ChatRequest,
  content: string,
  deps: ChatMethodologyDeps,
  capability: CapabilityContext
): Promise<{ report: string; states: ToolCallState[] } | undefined> {
  if (!capability.flags.coding || !deps.codingVerification) return undefined;
  const id = createId("call");
  const startedAt = nowIso();
  const running: ToolCallState = { id, toolName: "coding_verification", inputSummary: "quick verification", status: "running", startedAt };
  const result = await deps.codingVerification.verify(`${content}\n\n${lastUser(request)}`);
  if (result.status === "skipped" && result.attempts.length === 0 && result.report.includes("未发现可自动运行的 JS/TS 代码块")) {
    return undefined;
  }
  const done: ToolCallState = {
    ...running,
    status: result.status === "failed" ? "error" : "success",
    finishedAt: nowIso(),
    durationMs: Date.now() - Date.parse(startedAt),
    resultSummary: truncate(result.report),
    ...(result.status === "failed" ? { error: "Verification failed" } : {})
  };
  return { report: `\n\n${result.report}`, states: [running, done] };
}

function lastUser(request: ChatRequest): string {
  return [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}
}

namespace __core_core_emotionDetector {
import EmotionLabel = __ext_1.EmotionLabel;
export type EmotionState = EmotionLabel["state"];
export type EmotionIntensity = EmotionLabel["intensity"];

const patterns: Array<{ state: EmotionState; regex: RegExp }> = [
  { state: "frustrated", regex: /(崩溃|疯掉|疯了|烦死|受不了|搞不定|卡住了?|一直.{0,8}(修不好|不行|失败)|frustrated|stuck)/i },
  { state: "anxious", regex: /(焦虑|担心|害怕|紧张|怕.{0,8}(来不及|出错)|worr(?:y|ied)|anxious)/i },
  { state: "urgent", regex: /(紧急|马上|立刻|尽快|来不及|今天必须|deadline|asap|urgent)/i }
];

const highIntensity = /(崩溃|受不了|急死|马上|立刻|今天必须|deadline|asap|一直)/i;
const mediumIntensity = /(很|太|特别|一直|担心|紧张|卡住|尽快|urgent)/i;

export class EmotionDetector {
  analyze(text: string): EmotionLabel | null {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    for (const pattern of patterns) {
      const match = normalized.match(pattern.regex);
      if (!match) continue;
      return {
        state: pattern.state,
        intensity: intensityFor(normalized, match[0] ?? ""),
        sourcePhrase: match[0] ?? pattern.state
      };
    }
    return null;
  }
}

function intensityFor(text: string, sourcePhrase: string): EmotionIntensity {
  if (highIntensity.test(text) || highIntensity.test(sourcePhrase)) return "high";
  if (mediumIntensity.test(text) || mediumIntensity.test(sourcePhrase)) return "medium";
  return "low";
}
}

namespace __core_core_intentRouter {
import CapabilityContext = __ext_1.CapabilityContext;
import CapabilityFlags = __ext_1.CapabilityFlags;
import ChatRequest = __ext_1.ChatRequest;
import inferRouteDecision = __ext_1.inferRouteDecision;
import classifyWorkflow = __core_methodology_workflow.classifyWorkflow;
import inferPhase = __core_methodology_workflow.inferPhase;
import EmotionDetector = __core_core_emotionDetector.EmotionDetector;
const followUp = /^(重新写|重写|再写|继续|续写|扩写|润色|改写|换个角度|再来一版|重来)/i;
const inheritedCanvasHistory = /(申论|作文|论文|文章|报告|方案|文档|长文|Canvas|画布|```|代码|函数|脚本)/i;
const inheritedCodingHistory = /(```|代码|函数|脚本|调试|运行|bug)/i;

export class IntentRouter {
  constructor(private readonly emotionDetector = new EmotionDetector()) {}

  analyze(request: ChatRequest): CapabilityContext {
    const text = lastUser(request);
    const history = historyText(request);
    const inherited = followUp.test(text) && inheritedCanvasHistory.test(history);
    const decision = inferRouteDecision(text, {
      artifactMode: request.artifactMode,
      canvasMode: request.canvasMode,
      filesPresent: Boolean(request.files?.length)
    });
    const flags: CapabilityFlags = { ...decision.flags };
    const emotion = this.emotionDetector.analyze(text);

    const reasons = [...decision.reasons];
    if (inherited) {
      flags.canvas = true;
      reasons.push("基于上下文继承长文/Canvas 意图");
    }
    if (inherited && inheritedCodingHistory.test(history)) {
      flags.coding = true;
      reasons.push("基于上下文继承代码/调试意图");
    }

    return {
      workflow: classifyWorkflow(text || history),
      phase: inferPhase(text || history),
      flags,
      emotion,
      primaryGoal: text.replace(/\s+/g, " ").trim() || "未命名任务",
      reasons,
      modePreference: request.mode,
      route: decision.route
    };
  }
}

function lastUser(request: ChatRequest): string {
  return [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function historyText(request: ChatRequest): string {
  return request.messages.slice(0, -1).map((message) => message.content ?? "").join("\n").slice(-6000);
}
}

namespace __core_core_streamToolCalls {
import ToolCall = __ext_1.ToolCall;
import createId = __core_utils_id.createId;
export interface DraftToolCall {
  id?: string;
  name?: string;
  arguments: string;
}

export function mergeToolCallDeltas(drafts: DraftToolCall[], deltas: unknown): void {
  if (!Array.isArray(deltas)) return;
  deltas.forEach((delta, position) => {
    const row = delta as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    const index = typeof row.index === "number" ? row.index : position;
    drafts[index] ??= { arguments: "" };
    if (typeof row.id === "string" && row.id) drafts[index]!.id = row.id;
    if (typeof row.function?.name === "string" && row.function.name) drafts[index]!.name = row.function.name;
    if (typeof row.function?.arguments === "string") drafts[index]!.arguments += row.function.arguments;
  });
}

export function materializeToolCalls(drafts: DraftToolCall[]): ToolCall[] {
  return drafts.flatMap((draft) => {
    if (!draft.name) return [];
    return [{
      id: draft.id ?? createId("call"),
      type: "function" as const,
      function: { name: draft.name, arguments: draft.arguments || "{}" }
    }];
  });
}
}

namespace __core_modes_types {
import ChatMessage = __ext_1.ChatMessage;
import ChatRequest = __ext_1.ChatRequest;
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import ToolCallState = __ext_1.ToolCallState;
export interface ToolLoopLimits {
  maxToolRounds: number;
  maxTotalTokens: number;
  maxWallTimeMs: number;
  maxToolErrors: number;
}

export interface ModeResult {
  message: ChatMessage;
  messages: ChatMessage[];
  toolCalls: ToolCallState[];
  usages?: DeepSeekRawUsage[] | undefined;
  reasoningSummary?: string | undefined;
}

export interface ModeHandler {
  run(request: ChatRequest): Promise<ModeResult>;
}
}

namespace __core_modes_thinkingMode {
import ChatMessage = __ext_1.ChatMessage;
import ChatRequest = __ext_1.ChatRequest;
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import ToolCallState = __ext_1.ToolCallState;
import LLMClient = __core_core_llmClient.LLMClient;
import ToolCallRepair = __core_core_toolCallRepair.ToolCallRepair;
import ToolRouter = __core_core_toolRouter.ToolRouter;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import truncate = __core_utils_id.truncate;
import ModeResult = __core_modes_types.ModeResult;
import ToolLoopLimits = __core_modes_types.ToolLoopLimits;
export interface ThinkingModeHooks {
  prepareMessages?: (messages: ChatMessage[]) => Promise<ChatMessage[]> | ChatMessage[];
  beforeRound?: (input: { request: ChatRequest; messages: ChatMessage[]; usages: DeepSeekRawUsage[]; round: number }) => Promise<void> | void;
}

export class ThinkingMode {
  constructor(
    private readonly llm: LLMClient,
    private readonly toolRouter: ToolRouter,
    private readonly limits: ToolLoopLimits,
    private readonly hooks: ThinkingModeHooks = {}
  ) {}

  async run(request: ChatRequest): Promise<ModeResult> {
    const started = Date.now();
    const messages = [...request.messages];
    const toolStates: ToolCallState[] = [];
    const usages: DeepSeekRawUsage[] = [];
    const repair = new ToolCallRepair(this.toolRouter.listToolNames());
    let errors = 0;
    for (let round = 0; round < this.limits.maxToolRounds; round += 1) {
      if (Date.now() - started > this.limits.maxWallTimeMs) break;
      const roundMessages = await this.prepareMessages(messages);
      await this.hooks.beforeRound?.({ request, messages: roundMessages, usages: [...usages], round });
      const response = await this.llm.complete({
        model: request.model,
        thinking: request.thinking,
        messages: roundMessages,
        tools: this.toolRouter.listModelTools()
      });
      if (response.usage) usages.push(response.usage);
      const calls = repair.process(response.message.tool_calls ?? [], response.message.reasoning_content, response.message.content).calls;
      const assistantMessage = withRepairedToolCalls(response.message, calls);
      messages.push(assistantMessage);
      if (calls.length === 0) return this.done(response.message, messages, toolStates, usages);
      for (const chunk of this.toolChunks(calls)) {
        let offset = 0;
        while (offset < chunk.length && errors <= this.limits.maxToolErrors) {
          const activeChunk = chunk.slice(offset, offset + this.remainingToolExecutions(errors));
          offset += activeChunk.length;
          const states = activeChunk.map((call) => this.pending(call.id, call.function.name, call.function.arguments));
          toolStates.push(...states);
          const results = await Promise.all(activeChunk.map((call) => this.toolRouter.executeTool(call, { requestId: request.id, conversationId: request.conversationId ?? null })));
          for (let index = 0; index < activeChunk.length; index += 1) {
            const call = activeChunk[index]!;
            const state = states[index]!;
            const result = results[index]!;
            if (!result.ok) errors += 1;
            Object.assign(state, {
              status: result.ok ? "success" : "error",
              finishedAt: nowIso(),
              durationMs: state.startedAt ? Date.now() - Date.parse(state.startedAt) : 0,
              resultSummary: result.summary,
              error: result.error?.message
            });
            messages.push(this.toolMessage(call.id, result.content));
          }
        }
        if (errors > this.limits.maxToolErrors) break;
      }
      if (errors > this.limits.maxToolErrors) break;
    }
    const message = this.limitMessage();
    messages.push(message);
    return this.done(message, messages, toolStates, usages);
  }

  async collectStream(request: ChatRequest): Promise<{ content: string; reasoning: string }> {
    let content = "";
    let reasoning = "";
    for await (const delta of this.llm.stream(request)) {
      content += delta.content ?? "";
      reasoning += delta.reasoning_content ?? "";
    }
    return { content, reasoning };
  }

  private async prepareMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    return await this.hooks.prepareMessages?.(messages) ?? messages;
  }

  private done(message: ChatMessage, messages: ChatMessage[], toolCalls: ToolCallState[], usages: DeepSeekRawUsage[]): ModeResult {
    const reasoningSummary = summarizeReasoning(message.reasoning_content);
    return reasoningSummary ? { message, messages, toolCalls, usages, reasoningSummary } : { message, messages, toolCalls, usages };
  }

  private pending(id: string, name: string, args: string): ToolCallState {
    return {
      id,
      toolName: name,
      inputSummary: truncate(args.replace(/"[^"]*(key|token|secret|password)[^"]*"\s*:\s*"[^"]*"/gi, '"$1":"***"')),
      status: "running",
      startedAt: nowIso()
    };
  }

  private toolMessage(toolCallId: string, content: string): ChatMessage {
    return { id: createId("toolmsg"), role: "tool", tool_call_id: toolCallId, content, createdAt: nowIso() };
  }

  private remainingToolExecutions(errors: number): number {
    return Math.max(1, this.limits.maxToolErrors - errors + 1);
  }

  private limitMessage(): ChatMessage {
    return {
      id: createId("asst"),
      role: "assistant",
      content: "Tool loop stopped because execution limits were reached.",
      reasoning_content: null,
      createdAt: nowIso()
    };
  }

  private toolChunks(calls: NonNullable<ChatMessage["tool_calls"]>): Array<NonNullable<ChatMessage["tool_calls"]>> {
    const chunks: Array<NonNullable<ChatMessage["tool_calls"]>> = [];
    let parallel: NonNullable<ChatMessage["tool_calls"]> = [];
    for (const call of calls) {
      if (this.toolRouter.isParallelSafe(call.function.name)) {
        parallel.push(call);
        continue;
      }
      if (parallel.length) {
        chunks.push(parallel);
        parallel = [];
      }
      chunks.push([call]);
    }
    if (parallel.length) chunks.push(parallel);
    return chunks;
  }
}

function withRepairedToolCalls(message: ChatMessage, calls: NonNullable<ChatMessage["tool_calls"]>): ChatMessage {
  if (calls.length) return { ...message, tool_calls: calls };
  const { tool_calls: _toolCalls, ...rest } = message;
  return rest;
}

function summarizeReasoning(reasoning?: string | null): string | undefined {
  if (!reasoning) return undefined;
  return truncate(reasoning.replace(/\s+/g, " "), 180);
}
}

namespace __core_canvas_canvasDecisionService {
import CanvasKind = __ext_1.CanvasKind;
import CapabilityContext = __ext_1.CapabilityContext;
import ChatRequest = __ext_1.ChatRequest;
import inferRouteDecision = __ext_1.inferRouteDecision;
export interface CanvasDecision {
  useCanvas: boolean;
  kind: CanvasKind;
  title: string;
}

export class CanvasDecisionService {
  decide(request: ChatRequest, capability?: CapabilityContext | undefined): CanvasDecision {
    const text = lastUser(request);
    const manual = Boolean(request.canvasMode || request.artifactMode);
    const route = inferRouteDecision(text, {
      artifactMode: request.artifactMode,
      canvasMode: request.canvasMode,
      filesPresent: Boolean(request.files?.length)
    });
    const kind = request.canvasKind ?? route.canvasKind;
    const useCanvas = Boolean(manual || capability?.flags.canvas || route.flags.canvas);
    return { useCanvas, kind, title: titleFromText(text, kind) };
  }
}

function lastUser(request: ChatRequest): string {
  return [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function titleFromText(text: string, kind: CanvasKind) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return kind === "code" || kind === "app" ? "Code Canvas" : "Document Canvas";
  return clean.length > 44 ? `${clean.slice(0, 44)}...` : clean;
}
}

namespace __core_core_chatEngine {
import Artifact = __ext_1.Artifact;
import Canvas = __ext_1.Canvas;
import CapabilityContext = __ext_1.CapabilityContext;
import ChatMessage = __ext_1.ChatMessage;
import ChatRequest = __ext_1.ChatRequest;
import ChatResponse = __ext_1.ChatResponse;
import ChatStreamEvent = __ext_1.ChatStreamEvent;
import DeepSeekRawUsage = __ext_1.DeepSeekRawUsage;
import MemoryCandidate = __ext_1.MemoryCandidate;
import ToolCall = __ext_1.ToolCall;
import ToolCallState = __ext_1.ToolCallState;
import UsageSummary = __ext_1.UsageSummary;
import ChatRequestSchema = __ext_1.ChatRequestSchema;
import ArtifactManager = __core_core_artifactManager.ArtifactManager;
import ContextManager = __core_core_contextManager.ContextManager;
import ensureBudgetForChatRequest = __core_core_chatEngineBudget.ensureBudgetForChatRequest;
import turnUsageCost = __core_core_chatEngineBudget.turnUsageCost;
import persistMemoryCandidates = __core_core_chatEngineMemory.persistMemoryCandidates;
import lastUser = __core_core_chatEngineOutput.lastUser;
import sessionId = __core_core_chatEngineOutput.sessionId;
import shouldCreateDurableOutput = __core_core_chatEngineOutput.shouldCreateDurableOutput;
import summarizeArtifact = __core_core_chatEngineOutput.summarizeArtifact;
import summarizeCanvas = __core_core_chatEngineOutput.summarizeCanvas;
import summarizeReasoning = __core_core_chatEngineOutput.summarizeReasoning;
import withRepairedToolCalls = __core_core_chatEngineOutput.withRepairedToolCalls;
import CanvasStreamTarget = __core_core_chatEngineOutput.CanvasStreamTarget;
import compactChatMessages = __core_core_chatEngineRequest.compactChatMessages;
import prepareChatRequest = __core_core_chatEngineRequest.prepareChatRequest;
import chunkToolCalls = __core_core_chatEngineToolLoop.chunkToolCalls;
import remainingToolExecutions = __core_core_chatEngineToolLoop.remainingToolExecutions;
import sanitizeToolArguments = __core_core_chatEngineToolLoop.sanitizeToolArguments;
import LLMClient = __core_core_llmClient.LLMClient;
import PromptManager = __core_core_promptManager.PromptManager;
import preflightChat = __core_core_chatPreflight.preflightChat;
import coordinatorPromptContext = __core_core_chatMethodology.coordinatorPromptContext;
import verifyCodingContent = __core_core_chatMethodology.verifyCodingContent;
import ChatMethodologyDeps = __core_core_chatMethodology.ChatMethodologyDeps;
import IntentRouter = __core_core_intentRouter.IntentRouter;
import materializeToolCalls = __core_core_streamToolCalls.materializeToolCalls;
import mergeToolCallDeltas = __core_core_streamToolCalls.mergeToolCallDeltas;
import DraftToolCall = __core_core_streamToolCalls.DraftToolCall;
import ToolCallRepair = __core_core_toolCallRepair.ToolCallRepair;
import ToolRouter = __core_core_toolRouter.ToolRouter;
import MemoryPolicy = __core_memory_memoryPolicy.MemoryPolicy;
import MemoryStore = __core_memory_memoryStore.MemoryStore;
import ThinkingMode = __core_modes_thinkingMode.ThinkingMode;
import ToolLoopLimits = __core_modes_types.ToolLoopLimits;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
import truncate = __core_utils_id.truncate;
import CanvasDecisionService = __core_canvas_canvasDecisionService.CanvasDecisionService;
import CanvasService = __core_canvas_canvasService.CanvasService;
import inferCanvasKind = __core_canvas_canvasText.inferCanvasKind;
import BudgetService = __core_usage_budget.BudgetService;
import UsageTracker = __core_usage_usageTracker.UsageTracker;
export interface ChatEngineDeps extends ChatMethodologyDeps {
  llm: LLMClient;
  toolRouter: ToolRouter;
  contextManager: ContextManager;
  promptManager: PromptManager;
  intentRouter: IntentRouter;
  artifactManager: ArtifactManager;
  canvasDecision: CanvasDecisionService;
  canvasService: CanvasService;
  memoryStore: MemoryStore;
  memoryPolicy: MemoryPolicy;
  tokenCounter?: { countText(text: string): Promise<number> } | undefined;
  budgetService?: BudgetService | undefined;
  usageTracker?: UsageTracker | undefined;
  limits: ToolLoopLimits;
  showRawReasoning: boolean;
}

interface StreamRoundResult {
  message: ChatMessage;
  calls: ToolCall[];
  usages: DeepSeekRawUsage[];
}

export class ChatEngine {
  constructor(private readonly deps: ChatEngineDeps) {}

  async respond(raw: ChatRequest): Promise<ChatResponse> {
    const request = ChatRequestSchema.parse(raw);
    const capability = this.deps.intentRouter.analyze(request);
    const preflight = await preflightChat(request, this.deps.toolRouter, capability);
    const coordinated = await coordinatorPromptContext(preflight.request, capability, this.deps);
    const prepared = await this.prepare(preflight.request, capability, coordinated?.summary);
    const mode = new ThinkingMode(this.deps.llm, this.deps.toolRouter, this.deps.limits, {
      prepareMessages: (messages) => this.compactMessages(messages),
      beforeRound: async ({ messages, usages }) => {
        await this.ensureBudgetForRequest({ ...prepared, messages }, await turnUsageCost(prepared, usages, this.deps));
      }
    });
    const result = await mode.run(prepared);
    const usageSummary = await this.deps.usageTracker?.record({
      requestId: request.id,
      sessionId: sessionId(prepared),
      model: prepared.model,
      currency: prepared.currency,
      usages: result.usages ?? []
    });
    const verification = await verifyCodingContent(prepared, result.message.content ?? "", this.deps, capability);
    const responseMessage = verification
      ? { ...result.message, content: `${result.message.content ?? ""}${verification.report}` }
      : result.message;
    const toolCalls = [...preflight.toolCalls, ...result.toolCalls, ...(verification?.states ?? [])];
    const canvas = await this.maybeCreateCanvas(prepared, capability, responseMessage.content ?? "", responseMessage.id)
      ?? await this.maybeCreateDurableCanvas(prepared, responseMessage.content ?? "", responseMessage.id);
    const artifacts: Artifact[] = [];
    const candidates = await this.persistCandidates(prepared);
    const safeMessage = this.deps.showRawReasoning ? responseMessage : { ...responseMessage, reasoning_content: null };
    return {
      id: request.id,
      message: canvas ? { ...safeMessage, content: summarizeCanvas(canvas) } : artifacts.length ? { ...safeMessage, content: summarizeArtifact(artifacts[0]!) } : safeMessage,
      artifacts,
      canvases: canvas ? [canvas] : [],
      toolCalls,
      reasoningSummary: result.reasoningSummary ?? coordinated?.reasoningSummary ?? (candidates.length ? "Memory candidate detected." : undefined),
      rawReasoning: this.deps.showRawReasoning ? (result.message.reasoning_content ?? undefined) : undefined,
      usageSummary
    };
  }

  async *stream(raw: ChatRequest): AsyncIterable<ChatStreamEvent> {
    try {
      const request = ChatRequestSchema.parse(raw);
      const capability = this.deps.intentRouter.analyze(request);
      const preflight = await preflightChat(request, this.deps.toolRouter, capability);
      yield { type: "capability.hints", flags: capability.flags, reasons: capability.reasons };
      for (const state of preflight.toolCalls) yield { type: "tool.status", state };
      const coordinated = await coordinatorPromptContext(preflight.request, capability, this.deps);
      yield* this.streamWithTools(await this.prepare(preflight.request, capability, coordinated?.summary), capability);
    } catch (error) {
      yield { type: "error", code: "CHAT_FAILED", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private async *streamWithTools(request: ChatRequest, capability: CapabilityContext): AsyncIterable<ChatStreamEvent> {
    const started = Date.now();
    const messages = [...request.messages];
    const target = await this.startCanvasIfNeeded(request, capability);
    if (target) yield { type: "canvas.started", canvas: target.canvas };
    let errors = 0;
    let usageSummary: UsageSummary | undefined;
    const turnUsages: DeepSeekRawUsage[] = [];
    let accruedTurnCost = 0;
    const repair = new ToolCallRepair(this.deps.toolRouter.listToolNames());
    for (let round = 0; round < this.deps.limits.maxToolRounds; round += 1) {
      if (Date.now() - started > this.deps.limits.maxWallTimeMs) break;
      const roundMessages = await this.compactMessages(messages);
      await this.ensureBudgetForRequest({ ...request, messages: roundMessages }, accruedTurnCost);
      const streamed = yield* this.streamOneRound(request, roundMessages, target);
      turnUsages.push(...streamed.usages);
      usageSummary = await this.deps.usageTracker?.preview({ sessionId: sessionId(request), model: request.model, currency: request.currency, usages: turnUsages }) ?? usageSummary;
      accruedTurnCost = usageSummary?.turn.cost ?? accruedTurnCost;
      if (usageSummary) yield { type: "usage.updated", summary: usageSummary };
      const calls = repair.process(streamed.calls, streamed.message.reasoning_content, streamed.message.content).calls;
      const assistantMessage = withRepairedToolCalls(streamed.message, calls);
      messages.push(assistantMessage);
      if (calls.length === 0) {
        const finalUsageSummary = await this.deps.usageTracker?.record({
          requestId: request.id,
          sessionId: sessionId(request),
          model: request.model,
          currency: request.currency,
          usages: turnUsages
        }) ?? usageSummary;
        yield* this.finishStream(request, capability, assistantMessage, target, finalUsageSummary);
        return;
      }
      for await (const event of this.executeToolCalls(request, calls, messages, errors)) {
        if (event.state.status === "error") errors += 1;
        yield event;
      }
      if (errors > this.deps.limits.maxToolErrors) break;
    }
    const message = this.limitMessage();
    usageSummary = await this.deps.usageTracker?.record({
      requestId: request.id,
      sessionId: sessionId(request),
      model: request.model,
      currency: request.currency,
      usages: turnUsages
    }) ?? usageSummary;
    if (target) yield { type: "canvas.error", canvasId: target.canvas.id, message: message.content ?? "" };
    else yield { type: "message.delta", content: message.content ?? "" };
    yield { type: "message.done", messageId: message.id, content: message.content ?? "", usageSummary };
  }

  private async *streamOneRound(request: ChatRequest, messages: ChatMessage[], target?: CanvasStreamTarget): AsyncGenerator<ChatStreamEvent, StreamRoundResult> {
    const id = createId("asst");
    const toolDrafts: DraftToolCall[] = [];
    const usages: DeepSeekRawUsage[] = [];
    let content = "";
    let reasoning = "";
    for await (const delta of this.deps.llm.stream({
      model: request.model,
      thinking: request.thinking,
      messages,
      tools: this.deps.toolRouter.listModelTools()
    })) {
      if (delta.content) {
        content += delta.content;
        if (target) {
          target.buffer += delta.content;
          yield { type: "canvas.text_delta", canvasId: target.canvas.id, content: delta.content };
        } else {
          yield { type: "message.delta", content: delta.content };
        }
      }
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        if (this.deps.showRawReasoning) yield { type: "reasoning.raw", messageId: id, content: delta.reasoning_content };
      }
      if (delta.usage) usages.push(delta.usage);
      mergeToolCallDeltas(toolDrafts, delta.tool_calls);
    }
    const calls = materializeToolCalls(toolDrafts);
    const message: ChatMessage = { id, role: "assistant", content, reasoning_content: reasoning || null, createdAt: nowIso() };
    if (calls.length) message.tool_calls = calls;
    return { message, calls, usages };
  }

  private async *finishStream(request: ChatRequest, capability: CapabilityContext, message: ChatMessage, target?: CanvasStreamTarget, usageSummary?: UsageSummary): AsyncIterable<ChatStreamEvent> {
    const content = message.content ?? "";
    let doneContent = content;
    if (target) {
      const canvas = await this.deps.canvasService.update(target.canvas.id, {
        status: "ready",
        contentText: target.buffer,
        summary: truncate(target.buffer.replace(/\s+/g, " "), 180),
        reason: "stream_done"
      });
      doneContent = summarizeCanvas(canvas);
      yield { type: "canvas.done", canvas };
      const verification = await verifyCodingContent(request, target.buffer, this.deps, capability);
      if (verification) {
        for (const state of verification.states) yield { type: "tool.status", state };
        yield { type: "message.delta", content: verification.report };
        doneContent += verification.report;
      }
    } else {
      const canvas = await this.maybeCreateDurableCanvas(request, content, message.id);
      if (canvas) {
        doneContent = summarizeCanvas(canvas);
        yield { type: "canvas.done", canvas };
      }
      const verification = await verifyCodingContent(request, content, this.deps, capability);
      if (verification) {
        for (const state of verification.states) yield { type: "tool.status", state };
        yield { type: "message.delta", content: verification.report };
        doneContent += verification.report;
      }
    }
    await this.persistCandidates(request);
    for (const candidate of await this.deps.memoryStore.listCandidates({ conversationId: request.conversationId ?? null })) yield { type: "memory.candidate", candidate };
    const summary = summarizeReasoning(message.reasoning_content);
    if (summary) yield { type: "reasoning.summary", summary };
    yield { type: "message.done", messageId: message.id, content: doneContent, usageSummary };
  }

  private async startCanvasIfNeeded(request: ChatRequest, capability: CapabilityContext): Promise<CanvasStreamTarget | undefined> {
    const decision = this.deps.canvasDecision.decide(request, capability);
    if (!decision.useCanvas) return undefined;
    const canvas = await this.deps.canvasService.create({
      conversationId: request.conversationId ?? null,
      title: decision.title,
      kind: decision.kind,
      status: "streaming",
      contentText: "",
      metadata: { sourceRequestId: request.id }
    });
    return { canvas, buffer: "" };
  }

  private async maybeCreateCanvas(request: ChatRequest, capability: CapabilityContext, content: string, sourceMessageId: string): Promise<Canvas | undefined> {
    const decision = this.deps.canvasDecision.decide(request, capability);
    if (!decision.useCanvas) return undefined;
    return this.deps.canvasService.createFromText({
      conversationId: request.conversationId ?? null,
      title: decision.title,
      kind: decision.kind,
      text: content,
      sourceMessageId
    });
  }

  private async maybeCreateDurableCanvas(request: ChatRequest, content: string, sourceMessageId: string): Promise<Canvas | undefined> {
    if (!shouldCreateDurableOutput(request, content)) return undefined;
    const decision = this.deps.canvasDecision.decide(request);
    const kind = inferCanvasKind(`${lastUser(request)}\n${content.slice(0, 4000)}`);
    return this.deps.canvasService.createFromText({
      conversationId: request.conversationId ?? null,
      title: decision.title,
      kind,
      text: content,
      sourceMessageId
    });
  }

  private async *executeToolCalls(request: ChatRequest, calls: ToolCall[], messages: ChatMessage[], initialErrors: number): AsyncIterable<Extract<ChatStreamEvent, { type: "tool.status" }>> {
    let errors = initialErrors;
    for (const chunk of chunkToolCalls(calls, (name) => this.deps.toolRouter.isParallelSafe(name))) {
      let offset = 0;
      while (offset < chunk.length && errors <= this.deps.limits.maxToolErrors) {
        const activeChunk = chunk.slice(offset, offset + remainingToolExecutions(this.deps.limits.maxToolErrors, errors));
        offset += activeChunk.length;
        const states = activeChunk.map((call) => this.pending(call.id, call.function.name, call.function.arguments));
        for (const state of states) yield { type: "tool.status", state: { ...state } };
        const results = await Promise.all(activeChunk.map((call) => this.deps.toolRouter.executeTool(call, { requestId: request.id, conversationId: request.conversationId ?? null })));
        for (let index = 0; index < activeChunk.length; index += 1) {
          const call = activeChunk[index]!;
          const state = states[index]!;
          const result = results[index]!;
          if (!result.ok) errors += 1;
          Object.assign(state, {
            status: result.ok ? "success" : "error",
            finishedAt: nowIso(),
            durationMs: state.startedAt ? Date.now() - Date.parse(state.startedAt) : 0,
            resultSummary: result.summary,
            error: result.error?.message
          });
          messages.push(this.toolMessage(call.id, result.content));
          yield { type: "tool.status", state };
        }
      }
      if (errors > this.deps.limits.maxToolErrors) break;
    }
  }

  private async prepare(request: ChatRequest, capability: CapabilityContext, extraContext = ""): Promise<ChatRequest> {
    return prepareChatRequest(request, capability, this.deps, extraContext);
  }

  private compactMessages(messages: ChatMessage[]): Promise<ChatMessage[]> | ChatMessage[] {
    return compactChatMessages(messages, this.deps);
  }

  private async ensureBudgetForRequest(request: ChatRequest, accruedTurnCost = 0): Promise<void> {
    return ensureBudgetForChatRequest(request, this.deps, accruedTurnCost);
  }

  private async maybeCreateArtifact(request: ChatRequest, content: string): Promise<Artifact[]> {
    if (!shouldCreateDurableOutput(request, content)) return [];
    const type = /html/i.test(content) ? "html" : "markdown";
    const artifact = await this.deps.artifactManager.create({
      type,
      title: "AI Assistant Artifact",
      content,
      metadata: { sourceRequestId: request.id, conversationId: request.conversationId ?? null }
    });
    return [artifact];
  }

  private async persistCandidates(request: ChatRequest): Promise<MemoryCandidate[]> {
    return persistMemoryCandidates(request, this.deps);
  }

  private pending(id: string, name: string, args: string): ToolCallState {
    return {
      id,
      toolName: name,
      inputSummary: sanitizeToolArguments(args),
      status: "running",
      startedAt: nowIso()
    };
  }

  private toolMessage(toolCallId: string, content: string): ChatMessage {
    return { id: createId("toolmsg"), role: "tool", tool_call_id: toolCallId, content, createdAt: nowIso() };
  }

  private limitMessage(): ChatMessage {
    return {
      id: createId("asst"),
      role: "assistant",
      content: "Tool loop stopped because execution limits were reached.",
      reasoning_content: null,
      createdAt: nowIso()
    };
  }
}
}

namespace __core_runtime_chatFactory {
import AppEnv = __core_config_env.AppEnv;
import ChatEngine = __core_core_chatEngine.ChatEngine;
import ChatEngineDeps = __core_core_chatEngine.ChatEngineDeps;
import ContextManager = __core_core_contextManager.ContextManager;
import PromptManager = __core_core_promptManager.PromptManager;
import MemoryPolicy = __core_memory_memoryPolicy.MemoryPolicy;
type RuntimeChatDeps = Omit<ChatEngineDeps, "contextManager" | "promptManager" | "memoryPolicy" | "showRawReasoning" | "limits"> & {
  env: Pick<AppEnv, "SHOW_RAW_REASONING" | "MAX_TOOL_ROUNDS">;
};

export function createRuntimeChatEngine({ env, ...deps }: RuntimeChatDeps): ChatEngine {
  return new ChatEngine({
    ...deps,
    contextManager: new ContextManager(),
    promptManager: new PromptManager(),
    memoryPolicy: new MemoryPolicy(),
    showRawReasoning: env.SHOW_RAW_REASONING,
    limits: {
      maxToolRounds: env.MAX_TOOL_ROUNDS,
      maxTotalTokens: 64000,
      maxWallTimeMs: 120000,
      maxToolErrors: 3
    }
  });
}
}

namespace __core_canvasStudio_canvasAssetRegistry {
import AssetBlob = __ext_1.AssetBlob;
import AssetHashSchema = __ext_1.AssetHashSchema;
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import isConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.isConversationWorkspaceDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import nowIso = __core_utils_id.nowIso;
import AssetBlobRow = __core_canvasStudio_canvasStudioRows.AssetBlobRow;
import JsonObject = __core_canvasStudio_canvasStudioRows.JsonObject;
import stringify = __core_canvasStudio_canvasStudioRows.stringify;
import toAssetBlob = __core_canvasStudio_canvasStudioRows.toAssetBlob;
type Db = Pick<WorkbenchDatabase, "prepare">;
type DbBackend = Db | ConversationWorkspaceDatabase;

interface AssetRegistryScope {
  conversationId?: string | null;
  projectId?: string;
}

export class CanvasAssetRegistry {
  constructor(private readonly db: DbBackend) {}

  recordBlob(input: {
    hash: string;
    mime: string;
    bytes: number;
    storageUri: string;
    metadata?: JsonObject;
  }, scope: AssetRegistryScope = {}): AssetBlob {
    const db = this.dbForScope(scope);
    const hash = AssetHashSchema.parse(input.hash);
    const createdAt = this.getBlob(hash, scope)?.createdAt ?? nowIso();
    db
      .prepare(
        "INSERT INTO asset_blobs (hash, mime, bytes, storage_uri, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(hash) DO UPDATE SET mime = excluded.mime, bytes = excluded.bytes, storage_uri = excluded.storage_uri, metadata = excluded.metadata"
      )
      .run(hash, input.mime, input.bytes, input.storageUri, stringify(input.metadata), createdAt);
    return this.getBlob(hash, scope)!;
  }

  getBlob(hash: string, scope: AssetRegistryScope = {}): AssetBlob | undefined {
    const parsed = AssetHashSchema.safeParse(hash);
    if (!parsed.success) return undefined;
    const row = this.dbForScope(scope).prepare("SELECT * FROM asset_blobs WHERE hash = ?").get(parsed.data) as AssetBlobRow | undefined;
    return row ? toAssetBlob(row) : undefined;
  }

  private dbForScope(scope: AssetRegistryScope): Db {
    if (!isConversationWorkspaceDatabase(this.db)) return this.db;
    if (scope.projectId) {
      const db = this.db.dbForCanvasProject(scope.projectId);
      if (!db) throw new Error("Canvas Studio project not found");
      return db;
    }
    return this.db.dbForConversation(scope.conversationId ?? null);
  }
}
}

namespace __core_canvasStudio_contentAddressedAssetStore {
import createHash = __ext_0.createHash;
import mkdir = __ext_9.mkdir;
import readFile = __ext_9.readFile;
import writeFile = __ext_9.writeFile;
import dirname = __ext_8.dirname;
import join = __ext_8.join;
const sha256Pattern = /^[a-f0-9]{64}$/;

export type StoredAssetBlob = {
  hash: string;
  bytes: number;
  mime: string;
  storageUri: string;
};

export class ContentAddressedAssetStore {
  constructor(private readonly rootDir: string) {}

  async write(bytes: Buffer, options: { mime: string; extension?: string; conversationId?: string | null }): Promise<StoredAssetBlob> {
    const hash = createHash("sha256").update(bytes).digest("hex");
    const storageUri = `sha256/${hash.slice(0, 2)}/${hash}`;
    const absolutePath = join(this.assetRoot(options.conversationId), storageUri);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    return { hash, bytes: bytes.byteLength, mime: options.mime, storageUri };
  }

  async read(hash: string, options: { conversationId?: string | null } = {}): Promise<Buffer> {
    if (!sha256Pattern.test(hash)) throw new Error("Invalid asset hash");
    return readFile(join(this.assetRoot(options.conversationId), "sha256", hash.slice(0, 2), hash));
  }

  private assetRoot(conversationId: string | null | undefined): string {
    return conversationId ? join(this.rootDir, "conversations", conversationId, "assets") : this.rootDir;
  }
}
}

namespace __core_methodology_methodologyRepository {
import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
import isConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.isConversationWorkspaceDatabase;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import createId = __core_utils_id.createId;
import nowIso = __core_utils_id.nowIso;
export type EvidenceItem = {
  id: string;
  conversationId: string | null;
  projectId?: string | undefined;
  sourceType: string;
  claim: string;
  confidence: number;
  citation?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
};

export type ContradictionItem = {
  id: string;
  conversationId: string | null;
  projectId?: string | undefined;
  subjectA: string;
  subjectB: string;
  nature: string;
  rank: string;
  dominantSide: string;
  risk: string;
  createdAt: string;
};

export type FocusLock = {
  id: string;
  conversationId: string | null;
  projectId?: string | undefined;
  target: string;
  doneSignal: string;
  pausedItems: string[];
  createdAt: string;
  updatedAt: string;
};

export type ValidationCycle = {
  id: string;
  conversationId: string | null;
  projectId?: string | undefined;
  hypothesis: string;
  action: string;
  expected: string;
  actual: string;
  learning: string;
  createdAt: string;
};

export type FeedbackSynthesis = {
  id: string;
  conversationId: string | null;
  projectId?: string | undefined;
  sources: string[];
  agreements: string[];
  conflicts: string[];
  gaps: string[];
  createdAt: string;
};

type SqlDb = Pick<WorkbenchDatabase, "prepare">;
type Db = SqlDb | ConversationWorkspaceDatabase;

type EvidenceRow = { id: string; conversation_id: string | null; project_id: string | null; source_type: string; claim: string; confidence: number; citation: string | null; metadata: string; created_at: string };
type ContradictionRow = { id: string; conversation_id: string | null; project_id: string | null; subject_a: string; subject_b: string; nature: string; rank: string; dominant_side: string; risk: string; created_at: string };
type FocusRow = { id: string; conversation_id: string | null; project_id: string | null; target: string; done_signal: string; paused_items_json: string; created_at: string; updated_at: string };
type ValidationRow = { id: string; conversation_id: string | null; project_id: string | null; hypothesis: string; action: string; expected: string; actual: string; learning: string; created_at: string };
type FeedbackRow = { id: string; conversation_id: string | null; project_id: string | null; sources_json: string; agreements_json: string; conflicts_json: string; gaps_json: string; created_at: string };

export class MethodologyRepository {
  constructor(private readonly db: Db) {}

  addEvidence(input: Omit<EvidenceItem, "id" | "createdAt" | "conversationId"> & { conversationId?: string | null | undefined }): EvidenceItem {
    const db = this.dbForQuery(input);
    const id = createId("evid");
    const now = nowIso();
    db
      .prepare("INSERT INTO evidence_items (id, conversation_id, project_id, source_type, claim, confidence, citation, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.conversationId ?? null, input.projectId ?? null, input.sourceType, input.claim, input.confidence, input.citation ?? null, JSON.stringify(input.metadata ?? {}), now);
    const row = db.prepare("SELECT * FROM evidence_items WHERE id = ?").get(id) as EvidenceRow;
    return toEvidence(row);
  }

  listEvidence(query: { conversationId?: string | null | undefined; projectId?: string | undefined }): EvidenceItem[] {
    return selectRows(this.dbForQuery(query), "evidence_items", query).map((row) => toEvidence(row as EvidenceRow));
  }

  addContradiction(input: Omit<ContradictionItem, "id" | "createdAt" | "conversationId"> & { conversationId?: string | null | undefined }): ContradictionItem {
    const db = this.dbForQuery(input);
    const id = createId("contra");
    const now = nowIso();
    db
      .prepare("INSERT INTO contradiction_items (id, conversation_id, project_id, subject_a, subject_b, nature, rank, dominant_side, risk, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.conversationId ?? null, input.projectId ?? null, input.subjectA, input.subjectB, input.nature, input.rank, input.dominantSide, input.risk, now);
    const row = db.prepare("SELECT * FROM contradiction_items WHERE id = ?").get(id) as ContradictionRow;
    return toContradiction(row);
  }

  listContradictions(query: { conversationId?: string | null | undefined; projectId?: string | undefined }): ContradictionItem[] {
    return selectRows(this.dbForQuery(query), "contradiction_items", query).map((row) => toContradiction(row as ContradictionRow));
  }

  upsertFocusLock(input: Omit<FocusLock, "id" | "createdAt" | "updatedAt" | "conversationId"> & { conversationId?: string | null | undefined }): FocusLock {
    const db = this.dbForQuery(input);
    const current = this.getFocusLock({ conversationId: input.conversationId ?? null, projectId: input.projectId });
    const now = nowIso();
    if (current) {
      db.prepare("UPDATE focus_locks SET target = ?, done_signal = ?, paused_items_json = ?, updated_at = ? WHERE id = ?").run(input.target, input.doneSignal, JSON.stringify(input.pausedItems), now, current.id);
      return this.getFocusLock({ id: current.id })!;
    }
    const id = createId("focus");
    db
      .prepare("INSERT INTO focus_locks (id, conversation_id, project_id, target, done_signal, paused_items_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.conversationId ?? null, input.projectId ?? null, input.target, input.doneSignal, JSON.stringify(input.pausedItems), now, now);
    return this.getFocusLock({ id })!;
  }

  getFocusLock(query: { id?: string | undefined; conversationId?: string | null | undefined; projectId?: string | undefined }): FocusLock | undefined {
    const dbs = query.id ? this.allDbs() : [this.dbForQuery(query)];
    for (const db of dbs) {
      const row = query.id
        ? db.prepare("SELECT * FROM focus_locks WHERE id = ?").get(query.id)
        : query.projectId
          ? db.prepare("SELECT * FROM focus_locks WHERE project_id = ?").get(query.projectId)
          : db.prepare("SELECT * FROM focus_locks WHERE conversation_id IS ? AND project_id IS NULL").get(query.conversationId ?? null);
      if (row) return toFocus(row as FocusRow);
    }
    return undefined;
  }

  addValidationCycle(input: Omit<ValidationCycle, "id" | "createdAt" | "conversationId"> & { conversationId?: string | null | undefined }): ValidationCycle {
    const db = this.dbForQuery(input);
    const id = createId("valid");
    const now = nowIso();
    db
      .prepare("INSERT INTO validation_cycles (id, conversation_id, project_id, hypothesis, action, expected, actual, learning, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.conversationId ?? null, input.projectId ?? null, input.hypothesis, input.action, input.expected, input.actual, input.learning, now);
    const row = db.prepare("SELECT * FROM validation_cycles WHERE id = ?").get(id) as ValidationRow;
    return toValidation(row);
  }

  listValidationCycles(query: { conversationId?: string | null | undefined; projectId?: string | undefined }): ValidationCycle[] {
    return selectRows(this.dbForQuery(query), "validation_cycles", query).map((row) => toValidation(row as ValidationRow));
  }

  addFeedbackSynthesis(input: Omit<FeedbackSynthesis, "id" | "createdAt" | "conversationId"> & { conversationId?: string | null | undefined }): FeedbackSynthesis {
    const db = this.dbForQuery(input);
    const id = createId("feed");
    const now = nowIso();
    db
      .prepare("INSERT INTO feedback_syntheses (id, conversation_id, project_id, sources_json, agreements_json, conflicts_json, gaps_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.conversationId ?? null, input.projectId ?? null, JSON.stringify(input.sources), JSON.stringify(input.agreements), JSON.stringify(input.conflicts), JSON.stringify(input.gaps), now);
    const row = db.prepare("SELECT * FROM feedback_syntheses WHERE id = ?").get(id) as FeedbackRow;
    return toFeedback(row);
  }

  listFeedbackSyntheses(query: { conversationId?: string | null | undefined; projectId?: string | undefined }): FeedbackSynthesis[] {
    return selectRows(this.dbForQuery(query), "feedback_syntheses", query).map((row) => toFeedback(row as FeedbackRow));
  }

  private dbForQuery(query: { conversationId?: string | null | undefined; projectId?: string | undefined }): SqlDb {
    if (!isConversationWorkspaceDatabase(this.db)) return this.db;
    if (query.projectId) {
      const db = this.db.dbForCanvasProject(query.projectId);
      if (!db) throw new Error("Conversation workspace project not found");
      return db;
    }
    return this.db.dbForConversation(query.conversationId ?? null);
  }

  private allDbs(): SqlDb[] {
    return isConversationWorkspaceDatabase(this.db) ? this.db.allDatabases() : [this.db];
  }
}

function selectRows(db: SqlDb, table: string, query: { conversationId?: string | null | undefined; projectId?: string | undefined }) {
  if (query.projectId) return db.prepare(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY created_at DESC`).all(query.projectId);
  return db.prepare(`SELECT * FROM ${table} WHERE conversation_id IS ? ORDER BY created_at DESC`).all(query.conversationId ?? null);
}

function toEvidence(row: EvidenceRow): EvidenceItem {
  return { id: row.id, conversationId: row.conversation_id, projectId: row.project_id ?? undefined, sourceType: row.source_type, claim: row.claim, confidence: row.confidence, citation: row.citation ?? undefined, metadata: JSON.parse(row.metadata) as Record<string, unknown>, createdAt: row.created_at };
}

function toContradiction(row: ContradictionRow): ContradictionItem {
  return { id: row.id, conversationId: row.conversation_id, projectId: row.project_id ?? undefined, subjectA: row.subject_a, subjectB: row.subject_b, nature: row.nature, rank: row.rank, dominantSide: row.dominant_side, risk: row.risk, createdAt: row.created_at };
}

function toFocus(row: FocusRow): FocusLock {
  return { id: row.id, conversationId: row.conversation_id, projectId: row.project_id ?? undefined, target: row.target, doneSignal: row.done_signal, pausedItems: JSON.parse(row.paused_items_json) as string[], createdAt: row.created_at, updatedAt: row.updated_at };
}

function toValidation(row: ValidationRow): ValidationCycle {
  return { id: row.id, conversationId: row.conversation_id, projectId: row.project_id ?? undefined, hypothesis: row.hypothesis, action: row.action, expected: row.expected, actual: row.actual, learning: row.learning, createdAt: row.created_at };
}

function toFeedback(row: FeedbackRow): FeedbackSynthesis {
  return { id: row.id, conversationId: row.conversation_id, projectId: row.project_id ?? undefined, sources: JSON.parse(row.sources_json) as string[], agreements: JSON.parse(row.agreements_json) as string[], conflicts: JSON.parse(row.conflicts_json) as string[], gaps: JSON.parse(row.gaps_json) as string[], createdAt: row.created_at };
}
}

namespace __core_runtime_canvasFactory {
import CanvasAssetRegistry = __core_canvasStudio_canvasAssetRegistry.CanvasAssetRegistry;
import CanvasStudioStore = __core_canvasStudio_canvasStudioStore.CanvasStudioStore;
import ContentAddressedAssetStore = __core_canvasStudio_contentAddressedAssetStore.ContentAddressedAssetStore;
import CanvasDecisionService = __core_canvas_canvasDecisionService.CanvasDecisionService;
import CanvasRevisionStore = __core_canvas_canvasRevisionStore.CanvasRevisionStore;
import CanvasService = __core_canvas_canvasService.CanvasService;
import CanvasStore = __core_canvas_canvasStore.CanvasStore;
import CardStore = __core_cards_cardStore.CardStore;
import ArtifactManager = __core_core_artifactManager.ArtifactManager;
import MethodologyRepository = __core_methodology_methodologyRepository.MethodologyRepository;
import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
interface RuntimeCanvasDeps {
  workspace: ConversationWorkspaceStore;
  database: ConversationWorkspaceDatabase;
  cardStore: CardStore;
}

export function createRuntimeCanvas({ workspace, database, cardStore }: RuntimeCanvasDeps) {
  const canvasStudioStore = new CanvasStudioStore(database);
  const canvasAssetStore = new ContentAddressedAssetStore(workspace.rootPath());
  const canvasAssetRegistry = new CanvasAssetRegistry(database);
  const methodologyRepository = new MethodologyRepository(database);
  const artifactManager = new ArtifactManager(workspace, canvasStudioStore);
  const canvasStore = new CanvasStore(database, cardStore);
  const canvasRevisionStore = new CanvasRevisionStore(workspace);
  const canvasService = new CanvasService({ store: canvasStore, revisions: canvasRevisionStore, studio: canvasStudioStore });
  const canvasDecision = new CanvasDecisionService();
  return {
    canvasStudioStore,
    canvasAssetStore,
    canvasAssetRegistry,
    methodologyRepository,
    artifactManager,
    canvasStore,
    canvasRevisionStore,
    canvasService,
    canvasDecision
  };
}
}

namespace __core_tokenizer_deepSeekTokenCounter {
import ChatMessage = __ext_1.ChatMessage;
import TokenCountRequest = __ext_1.TokenCountRequest;
import TokenUsage = __ext_1.TokenUsage;
import Tokenizer = __ext_11.Tokenizer;
import readFile = __ext_9.readFile;
import dirname = __ext_8.dirname;
import join = __ext_8.join;
import resolve = __ext_8.resolve;
import fileURLToPath = __ext_12.fileURLToPath;
import deepSeekV4ContextBudgetTokens = __core_core_contextManager.deepSeekV4ContextBudgetTokens;
type TokenizerConfig = { model_max_length?: number; tokenizer_class?: string };

let tokenizerPromise: Promise<{ tokenizer: Tokenizer; config: TokenizerConfig }> | undefined;

export class DeepSeekTokenCounter {
  async countText(text: string): Promise<number> {
    const { tokenizer } = await loadTokenizer();
    return tokenizer.encode(text, { add_special_tokens: false }).ids.length;
  }

  async countComposer(input: TokenCountRequest): Promise<TokenUsage> {
    const draft = input.draft ?? "";
    const messages = input.messages ?? [];
    const [draftTokens, messageTokens] = await Promise.all([
      this.countText(draft),
      this.countMessages(messages)
    ]);
    const contextTokens = draftTokens + messageTokens;
    const budget = await this.contextBudget();
    return {
      tokenizer: "deepseek_v3_tokenizer",
      source: "deepseek_v3_official",
      draftTokens,
      contextTokens,
      contextBudgetTokens: budget,
      contextRemainingTokens: budget - contextTokens,
      messageTokens
    };
  }

  private async countMessages(messages: ChatMessage[]): Promise<number> {
    return this.countText(messages.map(formatMessage).join(""));
  }

  private async contextBudget(): Promise<number> {
    await loadTokenizer();
    return deepSeekV4ContextBudgetTokens;
  }
}

async function loadTokenizer() {
  tokenizerPromise ??= readTokenizer();
  return tokenizerPromise;
}

async function readTokenizer() {
  const dir = tokenizerDir();
  const [tokenizerJson, tokenizerConfig] = await Promise.all([
    readJson(join(dir, "tokenizer.json")),
    readJson(join(dir, "tokenizer_config.json"))
  ]);
  return { tokenizer: new Tokenizer(tokenizerJson, tokenizerConfig), config: tokenizerConfig as TokenizerConfig };
}

async function readJson(path: string): Promise<object> {
  return JSON.parse(await readFile(path, "utf8")) as object;
}

function tokenizerDir(): string {
  if (process.env.DEEPSEEK_TOKENIZER_DIR) return resolve(process.env.DEEPSEEK_TOKENIZER_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../tokenizer/deepseek_v3");
}

function formatMessage(message: ChatMessage): string {
  if (message.role === "system") return message.content ?? "";
  if (message.role === "user") return `<锝淯ser锝?${message.content ?? ""}`;
  if (message.role === "assistant") return `<锝淎ssistant锝?${message.content ?? ""}`;
  return `<锝渢ool鈻乷utputs鈻乥egin锝?${message.content ?? ""}<锝渢ool鈻乷utputs鈻乪nd锝?`;
}
}

namespace __core_runtime {
import AppEnv = __core_config_env.AppEnv;
import CardStore = __core_cards_cardStore.CardStore;
import IntentRouter = __core_core_intentRouter.IntentRouter;
import ConversationStore = __core_conversations_conversationStore.ConversationStore;
import ContextStore = __core_context_contextStore.ContextStore;
import FileStore = __core_files_fileStore.FileStore;
import WorkspaceFileReader = __core_files_workspaceFileReader.WorkspaceFileReader;
import AutoReviewService = __core_methodology_autoReview.AutoReviewService;
import CodeVerificationService = __core_methodology_codingVerification.CodeVerificationService;
import MultiPassCoordinator = __core_methodology_multiPassCoordinator.MultiPassCoordinator;
import PlanStore = __core_plans_planStore.PlanStore;
import DeepSeekPricingService = __core_pricing_deepSeekPricing.DeepSeekPricingService;
import createRuntimeCanvas = __core_runtime_canvasFactory.createRuntimeCanvas;
import createRuntimeChatEngine = __core_runtime_chatFactory.createRuntimeChatEngine;
import createRuntimeLlm = __core_runtime_llmFactory.createRuntimeLlm;
import createRuntimePlanTask = __core_runtime_planTaskFactory.createRuntimePlanTask;
import createRuntimeResearch = __core_runtime_researchFactory.createRuntimeResearch;
import createRuntimeStorage = __core_runtime_storageFactory.createRuntimeStorage;
import createRuntimeTools = __core_runtime_toolFactory.createRuntimeTools;
import MemoryStore = __core_memory_memoryStore.MemoryStore;
import TaskStore = __core_tasks_taskStore.TaskStore;
import DeepSeekTokenCounter = __core_tokenizer_deepSeekTokenCounter.DeepSeekTokenCounter;
import BudgetService = __core_usage_budget.BudgetService;
import UsageStore = __core_usage_usageStore.UsageStore;
import UsageTracker = __core_usage_usageTracker.UsageTracker;
export function createRuntime(env: AppEnv) {
  const { workspace, storage, database, legacyMigrationPromise } = createRuntimeStorage(env);
  const pricingService = new DeepSeekPricingService(storage);
  pricingService.refreshInBackgroundIfDue();
  const usageStore = new UsageStore(storage);
  const budgetService = new BudgetService(usageStore, {
    CNY: env.DEEPSEEK_SESSION_BUDGET_CNY,
    USD: env.DEEPSEEK_SESSION_BUDGET_USD
  });
  const usageTracker = new UsageTracker(pricingService, usageStore, budgetService);
  const cardStore = new CardStore(database);
  const {
    canvasStudioStore,
    canvasAssetStore,
    canvasAssetRegistry,
    methodologyRepository,
    artifactManager,
    canvasStore,
    canvasRevisionStore,
    canvasService,
    canvasDecision
  } = createRuntimeCanvas({ workspace, database, cardStore });
  const intentRouter = new IntentRouter();
  const conversationStore = new ConversationStore(database, cardStore);
  const contextStore = new ContextStore(workspace);
  const taskStore = new TaskStore(workspace);
  const tokenCounter = new DeepSeekTokenCounter();
  const memoryStore = new MemoryStore(workspace);
  const coordinator = new MultiPassCoordinator();
  const autoReview = new AutoReviewService();
  const codingVerification = new CodeVerificationService(env);
  const fileStore = new FileStore(workspace, {
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
    maxFileCount: env.MAX_UPLOAD_FILE_COUNT,
    ttlMs: 7 * 24 * 60 * 60 * 1000
  });
  const workspaceFileReader = new WorkspaceFileReader({ rootPath: process.cwd() });
  const { toolRouter, pluginManager, pluginLoadPromise, obsidianBridge } = createRuntimeTools({
    env,
    fileStore,
    workspaceFileReader,
    artifactManager,
    memoryStore
  });
  const { llm, useMockLlm } = createRuntimeLlm(env);
  const deepResearch = createRuntimeResearch({ toolRouter, useMockLlm });
  const planStore = new PlanStore(database, cardStore);
  const { planService, taskProcessor } = createRuntimePlanTask({
    env,
    llm,
    artifactManager,
    canvasService,
    coordinator,
    budgetService,
    usageTracker,
    taskStore,
    deepResearch,
    conversationStore,
    contextStore,
    planStore,
    autoReview
  });
  const chatEngine = createRuntimeChatEngine({
    env,
    llm,
    toolRouter,
    intentRouter,
    artifactManager,
    canvasDecision,
    canvasService,
    memoryStore,
    tokenCounter,
    budgetService,
    usageTracker,
    coordinator,
    codingVerification,
    autoReview,
    contextStore
  });
  return {
    storage,
    legacyMigrationPromise,
    workspace,
    database,
    canvasStudioStore,
    canvasAssetStore,
    canvasAssetRegistry,
    methodologyRepository,
    artifactManager,
    pricingService,
    usageStore,
    budgetService,
    usageTracker,
    cardStore,
    canvasStore,
    canvasRevisionStore,
    canvasService,
    conversationStore,
    contextStore,
    taskStore,
    tokenCounter,
    memoryStore,
    coordinator,
    autoReview,
    codingVerification,
    planStore,
    fileStore,
    workspaceFileReader,
    toolRouter,
    pluginManager,
    pluginLoadPromise,
    obsidianBridge,
    chatEngine,
    intentRouter,
    deepResearch,
    planService,
    taskProcessor
  };
}
}

namespace __core_modes_writingMode {
import z = __ext_2.z;
export const WritingOptionsSchema = z.object({
  format: z.enum(["article", "email", "summary", "rewrite", "report", "social"]),
  tone: z.string().optional(),
  audience: z.string().optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  language: z.string().optional()
});

export type WritingOptions = z.infer<typeof WritingOptionsSchema>;
}

namespace __core_modes_teachingMode {

export const teachingModeStrategy = {
  steps: ["assess-level", "explain", "example", "counterexample", "exercise", "check-understanding"],
  beginner: "Use concrete examples and reduce abstraction.",
  advanced: "Reduce repetition and focus on edge cases."
};
}

namespace __core_modes_planningMode {

export const planningModeActions = ["plan", "execute", "revise", "summarize"] as const;

export interface PlanningStep {
  input: string;
  output: string;
  toolDependency?: string;
}
}

namespace __core_modes_codingMode {

export const codingModeCapabilities = [
  "code-explanation",
  "code-review",
  "bug-localization",
  "refactor-advice",
  "test-generation",
  "architecture-advice"
] as const;
}

namespace __core_modes_chatMode {
import AppMode = __ext_1.AppMode;
export const chatMode: { mode: AppMode; defaultThinking: "disabled" } = {
  mode: "chat",
  defaultThinking: "disabled"
};
}

namespace __core_safety_sandbox {

export const localRestrictedRunnerNotice =
  "The local restricted runner is not a production-grade security sandbox.";
}

namespace __core_safety_permissions {

export function canPersistMemory(userConfirmed: boolean): boolean {
  return userConfirmed;
}
}

namespace __core_safety_limits {

export const defaultLimits = {
  maxToolRounds: 8,
  maxWallTimeMs: 120000,
  maxToolErrors: 3,
  stdoutLimit: 8000,
  stderrLimit: 8000
};
}

namespace __core_capabilities_skillSourceInventory {
import createHash = __ext_0.createHash;
import readdir = __ext_9.readdir;
import readFile = __ext_9.readFile;
const path = __default_0;
import CapabilityDuplicateGroup = __ext_1.CapabilityDuplicateGroup;
import CapabilitySourceLayer = __ext_1.CapabilitySourceLayer;
import CapabilitySourceManifest = __ext_1.CapabilitySourceManifest;
import CapabilitySourceMode = __ext_1.CapabilitySourceMode;
import CapabilitySourceSummary = __ext_1.CapabilitySourceSummary;
export const DEFAULT_SKILL_SOURCE_ROOT = "O:\\any_skills";

type Classification = {
  mode: CapabilitySourceMode;
  layer: CapabilitySourceLayer;
};

type SourceWithoutDuplicate = Omit<CapabilitySourceSummary, "duplicateGroup">;

export async function scanSkillSourceInventory(rootPath = DEFAULT_SKILL_SOURCE_ROOT): Promise<CapabilitySourceManifest> {
  const absoluteRoot = path.resolve(rootPath);
  const skillPaths = await findSkillFiles(absoluteRoot);
  const summaries = (await Promise.all(skillPaths.map((skillPath) => readSkillSummary(absoluteRoot, skillPath))))
    .sort((left, right) => left.path.localeCompare(right.path));
  const duplicateGroups = buildDuplicateGroups(summaries);
  const duplicateGroupByHash = new Map(duplicateGroups.map((group) => [group.hash, group.id]));

  return {
    rootPath: absoluteRoot,
    totalFiles: summaries.length,
    sources: summaries.map((summary) => ({
      ...summary,
      duplicateGroup: duplicateGroupByHash.get(summary.hash) ?? null
    })),
    duplicateGroups
  };
}

async function findSkillFiles(rootPath: string): Promise<string[]> {
  const output: string[] = [];
  await visit(rootPath, output);
  return output.sort((left, right) => left.localeCompare(right));
}

async function visit(directory: string, output: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(entryPath, output);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      output.push(path.resolve(entryPath));
    }
  }
}

async function readSkillSummary(rootPath: string, skillPath: string): Promise<SourceWithoutDuplicate> {
  const bytes = await readFile(skillPath);
  const content = bytes.toString("utf8");
  const suite = inferSuite(rootPath, skillPath);
  const name = parseFrontmatterName(content) ?? path.basename(path.dirname(skillPath));
  const classification = classifySkillSource({ suite, name, skillPath, content });

  return {
    suite,
    name,
    path: path.resolve(skillPath),
    hash: createHash("sha256").update(bytes).digest("hex"),
    lineCount: countLines(content),
    mode: classification.mode,
    layer: classification.layer
  };
}

function inferSuite(rootPath: string, skillPath: string): string {
  const relativeParts = path.relative(rootPath, skillPath).split(path.sep).filter(Boolean);
  return relativeParts.length > 1 ? relativeParts[0] ?? path.basename(rootPath) : path.basename(rootPath);
}

function parseFrontmatterName(content: string): string | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return undefined;

  for (const line of match[1].split(/\r\n|\n|\r/)) {
    const name = line.match(/^\s*name\s*:\s*(.+?)\s*$/i)?.[1];
    if (name) return cleanYamlScalar(name);
  }

  return undefined;
}

function cleanYamlScalar(value: string): string | undefined {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(['"])(.*)\1$/);
  const cleaned = quoted?.[2] ?? trimmed;
  return cleaned.length > 0 ? cleaned : undefined;
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length;
}

function buildDuplicateGroups(sources: SourceWithoutDuplicate[]): CapabilityDuplicateGroup[] {
  const byHash = new Map<string, SourceWithoutDuplicate[]>();
  for (const source of sources) {
    byHash.set(source.hash, [...(byHash.get(source.hash) ?? []), source]);
  }

  return [...byHash.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([hash, group]) => ({
      id: `exact:${hash.slice(0, 12)}`,
      hash,
      paths: group.map((source) => source.path).sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function classifySkillSource(input: { suite: string; name: string; skillPath: string; content: string }): Classification {
  const sourceId = `${input.suite}\n${input.name}\n${input.skillPath}`.toLowerCase();
  const text = `${input.suite}\n${input.name}\n${input.skillPath}\n${input.content}`.toLowerCase();
  const methodologyTerms = ["methodology", "workflow", "brainstorm", "debugging", "test-driven-development", "tdd", "verification-before-completion", "requesting-code-review", "receiving-code-review", "writing-plans"];
  const deckTerms = ["html-ppt", "slidev", "deck", "ppt", "presentation", "presenter", "reveal"];
  const toolTerms = ["amap", "api", "browser", "playwright", "mcp", "tool", "automation", "script"];
  const videoTerms = ["hyperframes", "video", "audio", "caption", "lottie", "gsap", "anime", "waapi"];
  const imageTerms = ["imagegen", "image", "bitmap", "brand", "logo", "sprite"];
  const prototypeTerms = ["prototype", "website", "frontend", "react", "next.js", "vue", "component", "ui"];
  const designTerms = ["design", "tailwind", "css", "impeccable", "taste", "wireframe"];
  const writingTerms = ["writer", "writing", "copywriting"];

  if (sourceId.includes("qiushi")) {
    return { mode: "methodology", layer: "methodology" };
  }
  if (hasAny(sourceId, deckTerms)) {
    return { mode: "deck", layer: "artifact" };
  }
  if (hasAny(sourceId, toolTerms)) {
    return { mode: "tool", layer: "tool-runtime" };
  }
  if (hasAny(sourceId, videoTerms)) {
    return { mode: "video", layer: "artifact" };
  }
  if (hasAny(sourceId, imageTerms)) {
    return { mode: "image", layer: "artifact" };
  }
  if (hasAny(sourceId, prototypeTerms)) {
    return { mode: "prototype", layer: "artifact" };
  }
  if (hasAny(sourceId, designTerms)) {
    return { mode: "design", layer: "design-system" };
  }
  if (hasAny(sourceId, writingTerms)) {
    return { mode: "writing", layer: "writing" };
  }
  if (hasAny(sourceId, methodologyTerms)) {
    return { mode: "methodology", layer: "methodology" };
  }

  if (hasAny(text, deckTerms)) {
    return { mode: "deck", layer: "artifact" };
  }
  if (hasAny(text, toolTerms)) {
    return { mode: "tool", layer: "tool-runtime" };
  }
  if (hasAny(text, videoTerms)) {
    return { mode: "video", layer: "artifact" };
  }
  if (hasAny(text, imageTerms)) {
    return { mode: "image", layer: "artifact" };
  }
  if (hasAny(text, prototypeTerms)) {
    return { mode: "prototype", layer: "artifact" };
  }
  if (hasAny(text, designTerms)) {
    return { mode: "design", layer: "design-system" };
  }
  if (hasAny(text, writingTerms)) {
    return { mode: "writing", layer: "writing" };
  }
  if (hasAny(text, ["methodology", "investigation", "contradiction", "debugging", "tdd", "brainstorm"])) {
    return { mode: "methodology", layer: "methodology" };
  }

  return { mode: "engineering", layer: "engineering" };
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
}

namespace __core_canvas_legacyArtifactCanvas {
import Artifact = __ext_1.Artifact;
import Canvas = __ext_1.Canvas;
import CanvasKind = __ext_1.CanvasKind;
import ChatMessage = __ext_1.ChatMessage;
import Conversation = __ext_1.Conversation;
import canvasSummary = __core_canvas_canvasText.canvasSummary;
import inferCanvasKind = __core_canvas_canvasText.inferCanvasKind;
import textToCanvasContent = __core_canvas_canvasText.textToCanvasContent;
const legacyCanvasPrefix = "legacy-artifact-";

export type LegacyArtifactCanvasMatch = {
  artifact: Artifact;
  conversationId?: string | null;
  sourceMessageId?: string;
};

export function legacyArtifactCanvasId(artifactId: string): string {
  return `${legacyCanvasPrefix}${artifactId}`;
}

export function legacyArtifactIdFromCanvasId(id: string): string | undefined {
  return id.startsWith(legacyCanvasPrefix) ? id.slice(legacyCanvasPrefix.length) : undefined;
}

export function legacyArtifactToCanvas(artifact: Artifact, match: Omit<LegacyArtifactCanvasMatch, "artifact"> = {}): Canvas {
  const kind = legacyArtifactKind(artifact);
  const metadata = {
    ...(artifact.metadata ?? {}),
    legacyArtifact: true,
    legacyArtifactId: artifact.id,
    legacyArtifactType: artifact.type
  };
  return {
    id: legacyArtifactCanvasId(artifact.id),
    conversationId: match.conversationId ?? metadataConversationId(artifact) ?? null,
    title: artifact.title,
    kind,
    status: "ready",
    contentJson: textToCanvasContent(artifact.content, kind),
    contentText: artifact.content,
    summary: canvasSummary(artifact.content),
    ...(match.sourceMessageId ? { sourceMessageId: match.sourceMessageId } : {}),
    version: artifact.version,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    metadata
  };
}

export function legacyArtifactsForConversation(artifacts: Artifact[], conversation?: Conversation): LegacyArtifactCanvasMatch[] {
  if (!conversation) return artifacts.map((artifact) => ({ artifact, conversationId: metadataConversationId(artifact) ?? null }));

  const matches = new Map<string, LegacyArtifactCanvasMatch>();
  for (const artifact of artifacts) {
    if (metadataConversationId(artifact) === conversation.id) {
      matches.set(artifact.id, { artifact, conversationId: conversation.id });
    }
  }

  for (const message of conversation.messages) {
    const artifact = closestMentionedArtifact(artifacts, message);
    if (artifact) matches.set(artifact.id, { artifact, conversationId: conversation.id, sourceMessageId: message.id });
  }

  return [...matches.values()].sort((left, right) => right.artifact.updatedAt.localeCompare(left.artifact.updatedAt));
}

function closestMentionedArtifact(artifacts: Artifact[], message: ChatMessage): Artifact | undefined {
  const candidates = artifacts.filter((artifact) => messageMentionsArtifact(message, artifact));
  if (candidates.length <= 1) return candidates[0];
  const messageTime = Date.parse(message.createdAt);
  if (!Number.isFinite(messageTime)) return candidates[0];
  return [...candidates].sort((left, right) => artifactDistance(left, messageTime) - artifactDistance(right, messageTime))[0];
}

function messageMentionsArtifact(message: ChatMessage, artifact: Artifact): boolean {
  const content = message.content ?? "";
  if (!artifact.title || !content.includes(artifact.title)) return false;
  return content.includes(artifact.type) || content.includes(`v${artifact.version}`) || content.includes("Canvas") || content.includes("Artifact");
}

function artifactDistance(artifact: Artifact, targetTime: number): number {
  const time = Date.parse(artifact.updatedAt || artifact.createdAt);
  return Number.isFinite(time) ? Math.abs(time - targetTime) : Number.MAX_SAFE_INTEGER;
}

function metadataConversationId(artifact: Artifact): string | undefined {
  return typeof artifact.metadata?.conversationId === "string" ? artifact.metadata.conversationId : undefined;
}

function legacyArtifactKind(artifact: Artifact): CanvasKind {
  if (artifact.type === "code") return "code";
  if (artifact.type === "html") return "app";
  return inferCanvasKind(artifact.content);
}
}

namespace __core_agents_baseAgent {
import AgentLimits = __ext_1.AgentLimits;
import AgentName = __ext_1.AgentName;
export interface AgentInput {
  task: string;
  context: string;
}

export interface AgentOutput {
  agent: AgentName;
  summary: string;
  complete: boolean;
}

export abstract class BaseAgent {
  constructor(
    readonly name: AgentName,
    protected readonly limits: AgentLimits
  ) {}

  async run(input: AgentInput): Promise<AgentOutput> {
    return {
      agent: this.name,
      summary: `${this.name} stub accepted task: ${input.task.slice(0, 120)}`,
      complete: true
    };
  }
}
}

namespace __core_agents_coordinatorAgent {
import BaseAgent = __core_agents_baseAgent.BaseAgent;
export class CoordinatorAgent extends BaseAgent {
  constructor() {
    super("coordinator", { maxRounds: 4, maxTokens: 12000 });
  }
}
}

namespace __core_agents_coderAgent {
import BaseAgent = __core_agents_baseAgent.BaseAgent;
export class CoderAgent extends BaseAgent {
  constructor() {
    super("coder", { maxRounds: 3, maxTokens: 10000 });
  }
}
}

namespace __core_agents_agentPolicy {
const path = __default_0;
export type AgentMode = "suggest" | "auto-edit" | "full-auto";

export interface ReadFileAction {
  id?: string;
  type: "read_file";
  path: string;
}

export interface ListFilesAction {
  id?: string;
  type: "list_files";
  path?: string;
  pattern?: string;
}

export interface SearchFilesAction {
  id?: string;
  type: "search_files";
  query: string;
  path?: string;
}

export interface ApplyPatchAction {
  id?: string;
  type: "apply_patch";
  patch: string;
}

export interface RunCommandAction {
  id?: string;
  type: "run_command";
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface FinishAction {
  id?: string;
  type: "finish";
  summary: string;
}

export type AgentAction =
  | ReadFileAction
  | ListFilesAction
  | SearchFilesAction
  | ApplyPatchAction
  | RunCommandAction
  | FinishAction;

export interface PathPolicyResult {
  scope: "workspace" | "external" | "rejected";
  rawPath: string;
  resolvedPath: string;
  requiresApproval: boolean;
  reason: string;
}

export interface CommandRisk {
  level: "low" | "approval" | "dangerous";
  reason: string;
}

export interface ActionPolicyResult {
  requiresApproval: boolean;
  blocked: boolean;
  reason: string;
  risk?: CommandRisk;
}

const SENSITIVE_WORKSPACE_SEGMENTS = new Set([".git", "node_modules", "dist"]);

export function resolveWorkspacePath(input: { rawPath: string; workspaceRoot: string }): PathPolicyResult {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const rawPath = input.rawPath.trim();

  if (!rawPath) {
    return {
      scope: "rejected",
      rawPath,
      resolvedPath: workspaceRoot,
      requiresApproval: true,
      reason: "Empty paths are not allowed."
    };
  }

  if (!path.isAbsolute(rawPath) && rawPath.split(/[\\/]+/).includes("..")) {
    return {
      scope: "rejected",
      rawPath,
      resolvedPath: path.resolve(workspaceRoot, rawPath),
      requiresApproval: true,
      reason: "Path traversal is rejected."
    };
  }

  const resolvedPath = path.resolve(path.isAbsolute(rawPath) ? rawPath : path.join(workspaceRoot, rawPath));
  const relative = path.relative(workspaceRoot, resolvedPath);
  const insideWorkspace = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (!insideWorkspace) {
    return {
      scope: "external",
      rawPath,
      resolvedPath,
      requiresApproval: true,
      reason: "Path is outside the workspace and requires explicit approval."
    };
  }

  const segments = relative.split(path.sep).filter(Boolean);
  if (segments.some((segment) => SENSITIVE_WORKSPACE_SEGMENTS.has(segment))) {
    return {
      scope: "rejected",
      rawPath,
      resolvedPath,
      requiresApproval: true,
      reason: "Sensitive workspace directories are rejected."
    };
  }

  return {
    scope: "workspace",
    rawPath,
    resolvedPath,
    requiresApproval: false,
    reason: "Path is inside the workspace."
  };
}

export function classifyCommandRisk(command: string): CommandRisk {
  const normalized = command.trim().toLowerCase();

  if (
    /\brm\s+-rf\b/.test(normalized) ||
    /\bremove-item\b.*(?:^|\s)-recurse\b/.test(normalized) ||
    /\bgit\s+reset\b.*\b--hard\b/.test(normalized) ||
    /\bgit\s+clean\b.*\b-f/.test(normalized) ||
    /\bshutdown\b/.test(normalized) ||
    /\bformat\b/.test(normalized) ||
    /\bdel\b.*\/s/.test(normalized) ||
    /\brd\b.*\/s/.test(normalized) ||
    /\bchmod\s+-r\b/.test(normalized) ||
    /\bchown\s+-r\b/.test(normalized) ||
    /\bsudo\b/.test(normalized) ||
    /\bcurl\b.*\|\s*(sh|bash|pwsh|powershell)\b/.test(normalized) ||
    /\binvoke-webrequest\b.*\|\s*(iex|invoke-expression)\b/.test(normalized)
  ) {
    return {
      level: "dangerous",
      reason: "Command can delete, reset, escalate privileges, or execute remote code."
    };
  }

  if (
    /^git\s+(status|diff|log|branch|rev-parse|show)\b/.test(normalized) ||
    /^(pwd|ls|dir)\b/.test(normalized) ||
    /^get-childitem\b/.test(normalized) ||
    /^node\s+--version\b/.test(normalized) ||
    /^corepack\s+pnpm\s+--version\b/.test(normalized)
  ) {
    return { level: "low", reason: "Read-only inspection command." };
  }

  return {
    level: "approval",
    reason: "Command may change state or consume resources and requires approval."
  };
}

export function evaluateActionPolicy(input: {
  action: AgentAction;
  mode: AgentMode;
  workspaceRoot: string;
}): ActionPolicyResult {
  const { action, mode, workspaceRoot } = input;

  if (action.type === "finish") {
    return { requiresApproval: false, blocked: false, reason: "Finish actions are safe." };
  }

  if (action.type === "run_command") {
    const risk = classifyCommandRisk(action.command);
    if (risk.level === "dangerous") {
      return { requiresApproval: true, blocked: true, reason: risk.reason, risk };
    }
    if (mode === "full-auto" && risk.level === "low") {
      return { requiresApproval: false, blocked: false, reason: risk.reason, risk };
    }
    return { requiresApproval: true, blocked: false, reason: risk.reason, risk };
  }

  if (action.type === "apply_patch") {
    const paths = extractPatchPaths(action);
    const pathResults = paths.map((rawPath) => resolveWorkspacePath({ rawPath, workspaceRoot }));
    const rejected = pathResults.find((result) => result.scope === "rejected");
    if (rejected) return { requiresApproval: true, blocked: true, reason: rejected.reason };

    const external = pathResults.find((result) => result.scope === "external");
    if (external) return { requiresApproval: true, blocked: false, reason: external.reason };

    if (mode === "suggest") {
      return {
        requiresApproval: true,
        blocked: false,
        reason: "Suggest mode requires approval before file edits."
      };
    }

    return {
      requiresApproval: false,
      blocked: false,
      reason: "Auto-edit mode allows workspace file edits."
    };
  }

  if (action.type === "read_file") {
    const result = resolveWorkspacePath({ rawPath: action.path, workspaceRoot });
    return {
      requiresApproval: result.requiresApproval,
      blocked: result.scope === "rejected",
      reason: result.reason
    };
  }

  if (action.type === "list_files" || action.type === "search_files") {
    const result = resolveWorkspacePath({ rawPath: action.path ?? ".", workspaceRoot });
    return {
      requiresApproval: result.requiresApproval,
      blocked: result.scope === "rejected",
      reason: result.reason
    };
  }

  return { requiresApproval: true, blocked: true, reason: "Unknown action is blocked." };
}

export function extractPatchPaths(action: ApplyPatchAction): string[] {
  const paths: string[] = [];
  const pattern = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

  for (const match of action.patch.matchAll(pattern)) {
    const rawPath = match[1]?.trim();
    if (rawPath) paths.push(rawPath);
  }

  return Array.from(new Set(paths));
}
}

namespace __core_agents_teacherAgent {
import BaseAgent = __core_agents_baseAgent.BaseAgent;
export class TeacherAgent extends BaseAgent {
  constructor() {
    super("teacher", { maxRounds: 3, maxTokens: 8000 });
  }
}
}

namespace __core_agents_researcherAgent {
import BaseAgent = __core_agents_baseAgent.BaseAgent;
export class ResearcherAgent extends BaseAgent {
  constructor() {
    super("researcher", { maxRounds: 3, maxTokens: 8000 });
  }
}
}

namespace __core_agents_writerAgent {
import BaseAgent = __core_agents_baseAgent.BaseAgent;
export class WriterAgent extends BaseAgent {
  constructor() {
    super("writer", { maxRounds: 3, maxTokens: 8000 });
  }
}
}

namespace __core_context_fingerprint {
import createHash = __ext_0.createHash;
import ContextBlock = __core_context_assembler.ContextBlock;
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(",")}}`;
}

export function fingerprintBlocks(blocks: readonly ContextBlock[]): string {
  const payload = blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content,
    source: block.source,
    priority: block.priority,
    tokenEstimate: block.tokenEstimate,
    cacheStable: block.cacheStable,
    metadata: block.metadata ?? {}
  }));

  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
}

namespace __core_context_assembler {
import fingerprintBlocks = __core_context_fingerprint.fingerprintBlocks;
export type ContextBlockType =
  | "system"
  | "memory"
  | "session"
  | "tool"
  | "file"
  | "conversation"
  | "plan"
  | "summary"
  | "custom";

export type ContextSource =
  | string
  | {
      kind: string;
      uri?: string;
      name?: string;
      metadata?: Record<string, unknown>;
    };

export interface ContextBlock {
  id: string;
  type: ContextBlockType;
  content: string;
  source: ContextSource;
  priority: number;
  tokenEstimate: number;
  cacheStable: boolean;
  metadata?: Record<string, unknown>;
}

export type RenderedRole = "system" | "user" | "assistant" | "tool";

export interface RenderedMessage {
  role: RenderedRole;
  content: string;
  blockIds: string[];
  cacheStable: boolean;
}

export interface RenderedSection {
  title: string;
  content: string;
  blockIds: string[];
  cacheStable: boolean;
}

export interface BudgetOptions {
  totalTokenBudget: number;
  stablePrefixTokenBudget?: number;
  dynamicTokenBudget?: number;
  tailConversationTokens?: number;
  minTruncatedTokens?: number;
}

export interface ContextAssemblerOptions {
  budget: BudgetOptions;
  truncationMarker?: string;
}

export interface BudgetUsage {
  total: number;
  stablePrefix: number;
  dynamic: number;
  totalBudget: number;
  stablePrefixBudget: number;
  dynamicBudget: number;
}

export interface ContextDiagnostic {
  id: string;
  type: ContextBlockType;
  reason: string;
  originalTokenEstimate: number;
  finalTokenEstimate?: number;
}

export interface ContextAssemblyResult {
  blocks: ContextBlock[];
  messages: RenderedMessage[];
  sections: RenderedSection[];
  usage: BudgetUsage;
  truncated: ContextDiagnostic[];
  dropped: ContextDiagnostic[];
  prefixFingerprint: string;
  fullFingerprint: string;
}

export interface BlockBuilderInput {
  id: string;
  content: string;
  source?: ContextSource;
  priority?: number;
  tokenEstimate?: number;
  cacheStable?: boolean;
  metadata?: Record<string, unknown>;
}

interface Candidate {
  block: ContextBlock;
  originalIndex: number;
  tailProtected: boolean;
}

const DEFAULT_TRUNCATION_MARKER = "\n[truncated: content omitted due to context budget]";

export class ContextAssembler {
  private readonly budget: Required<BudgetOptions>;
  private readonly truncationMarker: string;

  constructor(options: ContextAssemblerOptions) {
    this.budget = normalizeBudget(options.budget);
    this.truncationMarker = options.truncationMarker ?? DEFAULT_TRUNCATION_MARKER;
  }

  assemble(input: {
    stablePrefixBlocks: readonly ContextBlock[];
    dynamicBlocks: readonly ContextBlock[];
  }): ContextAssemblyResult {
    const stableCandidates = deterministicCandidates(input.stablePrefixBlocks.filter((block) => block.cacheStable));
    const dynamicCandidates = deterministicCandidates([
      ...input.stablePrefixBlocks.filter((block) => !block.cacheStable),
      ...input.dynamicBlocks
    ]);

    markConversationTail(dynamicCandidates, this.budget.tailConversationTokens);

    const truncated: ContextDiagnostic[] = [];
    const dropped: ContextDiagnostic[] = [];
    const stableSelected = this.selectForBudget(
      stableCandidates,
      this.budget.stablePrefixTokenBudget,
      "stable prefix budget",
      truncated,
      dropped
    );
    const dynamicSelected = this.selectForBudget(
      dynamicCandidates,
      this.budget.dynamicTokenBudget,
      "dynamic budget",
      truncated,
      dropped
    );

    let blocks = [...stableSelected, ...dynamicSelected];
    if (sumTokens(blocks) > this.budget.totalTokenBudget) {
      blocks = this.enforceTotalBudget(blocks, truncated, dropped);
    }

    const stableBlocks = blocks.filter((block) => block.cacheStable);
    const dynamicBlocks = blocks.filter((block) => !block.cacheStable);
    const usage: BudgetUsage = {
      stablePrefix: sumTokens(stableBlocks),
      dynamic: sumTokens(dynamicBlocks),
      total: sumTokens(blocks),
      stablePrefixBudget: this.budget.stablePrefixTokenBudget,
      dynamicBudget: this.budget.dynamicTokenBudget,
      totalBudget: this.budget.totalTokenBudget
    };

    return {
      blocks,
      messages: renderMessages(blocks),
      sections: renderSections(blocks),
      usage,
      truncated,
      dropped,
      prefixFingerprint: fingerprintBlocks(stableBlocks),
      fullFingerprint: fingerprintBlocks(blocks)
    };
  }

  private selectForBudget(
    candidates: readonly Candidate[],
    budget: number,
    reason: string,
    truncated: ContextDiagnostic[],
    dropped: ContextDiagnostic[]
  ): ContextBlock[] {
    const selected: ContextBlock[] = [];
    let used = 0;

    for (const candidate of candidates) {
      if (candidate.block.tokenEstimate <= budget - used) {
        selected.push(candidate.block);
        used += candidate.block.tokenEstimate;
        continue;
      }

      const remaining = Math.max(0, budget - used);
      const minTruncatedTokens = Math.min(this.budget.minTruncatedTokens, candidate.block.tokenEstimate);
      if (remaining >= minTruncatedTokens) {
        const block = truncateBlock(candidate.block, remaining, this.truncationMarker);
        selected.push(block);
        used += block.tokenEstimate;
        truncated.push({
          id: candidate.block.id,
          type: candidate.block.type,
          reason,
          originalTokenEstimate: candidate.block.tokenEstimate,
          finalTokenEstimate: block.tokenEstimate
        });
        continue;
      }

      dropped.push({
        id: candidate.block.id,
        type: candidate.block.type,
        reason,
        originalTokenEstimate: candidate.block.tokenEstimate
      });
    }

    return orderForRender(selected);
  }

  private enforceTotalBudget(
    blocks: readonly ContextBlock[],
    truncated: ContextDiagnostic[],
    dropped: ContextDiagnostic[]
  ): ContextBlock[] {
    const candidates = deterministicCandidates(blocks);
    markConversationTail(candidates, this.budget.tailConversationTokens);
    return this.selectForBudget(candidates, this.budget.totalTokenBudget, "total budget", truncated, dropped);
  }
}

export function estimateContextTokens(content: string): number {
  const trimmed = content.trim();
  return trimmed.length === 0 ? 0 : Math.max(1, Math.ceil(trimmed.length / 4));
}

export function systemBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("system", { source: "system", priority: 1000, cacheStable: true }, input);
}

export function memoryBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("memory", { source: "memory-index", priority: 800, cacheStable: true }, input);
}

export function sessionBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("session", { source: "session-snapshot", priority: 900, cacheStable: true }, input);
}

export function toolBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("tool", { source: "tool-result", priority: 450, cacheStable: false }, input);
}

export function fileBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("file", { source: "file-snippet", priority: 500, cacheStable: false }, input);
}

export function conversationBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("conversation", { source: "conversation-log", priority: 600, cacheStable: false }, input);
}

export function planBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("plan", { source: "plan", priority: 650, cacheStable: false }, input);
}

export function summaryBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("summary", { source: "summary", priority: 700, cacheStable: false }, input);
}

export function customBlock(input: BlockBuilderInput): ContextBlock {
  return buildBlock("custom", { source: "custom", priority: 500, cacheStable: false }, input);
}

export function snippetizeContent(content: string, maxChars = 1200): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n[snippet truncated: ${content.length - maxChars} chars omitted]`;
}

export function toolSnippetBlock(input: BlockBuilderInput & { maxChars?: number }): ContextBlock {
  return toolBlock({
    ...input,
    content: snippetizeContent(input.content, input.maxChars),
    metadata: { ...(input.metadata ?? {}), snippetized: input.content.length > (input.maxChars ?? 1200) }
  });
}

export function fileSnippetBlock(input: BlockBuilderInput & { maxChars?: number }): ContextBlock {
  return fileBlock({
    ...input,
    content: snippetizeContent(input.content, input.maxChars),
    metadata: { ...(input.metadata ?? {}), snippetized: input.content.length > (input.maxChars ?? 1200) }
  });
}

function normalizeBudget(budget: BudgetOptions): Required<BudgetOptions> {
  return {
    totalTokenBudget: budget.totalTokenBudget,
    stablePrefixTokenBudget: budget.stablePrefixTokenBudget ?? budget.totalTokenBudget,
    dynamicTokenBudget: budget.dynamicTokenBudget ?? budget.totalTokenBudget,
    tailConversationTokens: budget.tailConversationTokens ?? 0,
    minTruncatedTokens: budget.minTruncatedTokens ?? 8
  };
}

function buildBlock(
  type: ContextBlockType,
  defaults: Pick<ContextBlock, "source" | "priority" | "cacheStable">,
  input: BlockBuilderInput
): ContextBlock {
  return {
    id: input.id,
    type,
    content: input.content,
    source: input.source ?? defaults.source,
    priority: input.priority ?? defaults.priority,
    tokenEstimate: input.tokenEstimate ?? estimateContextTokens(input.content),
    cacheStable: input.cacheStable ?? defaults.cacheStable,
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

function deterministicCandidates(blocks: readonly ContextBlock[]): Candidate[] {
  return blocks.map((block, originalIndex) => ({ block, originalIndex, tailProtected: false })).sort(compareCandidates);
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const tail = Number(right.tailProtected) - Number(left.tailProtected);
  if (tail !== 0) return tail;
  const priority = right.block.priority - left.block.priority;
  if (priority !== 0) return priority;
  const stable = Number(right.block.cacheStable) - Number(left.block.cacheStable);
  if (stable !== 0) return stable;
  const type = left.block.type.localeCompare(right.block.type);
  if (type !== 0) return type;
  const id = left.block.id.localeCompare(right.block.id);
  if (id !== 0) return id;
  return left.originalIndex - right.originalIndex;
}

function markConversationTail(candidates: Candidate[], tailConversationTokens: number): void {
  if (tailConversationTokens <= 0) return;

  let used = 0;
  const conversation = candidates
    .filter((candidate) => candidate.block.type === "conversation")
    .sort((left, right) => right.originalIndex - left.originalIndex);

  for (const candidate of conversation) {
    if (used >= tailConversationTokens) break;
    candidate.tailProtected = true;
    used += candidate.block.tokenEstimate;
  }

  candidates.sort(compareCandidates);
}

function truncateBlock(block: ContextBlock, targetTokens: number, marker: string): ContextBlock {
  const markerTokens = Math.max(1, Math.ceil(marker.length / 4));
  const contentTokens = Math.max(0, targetTokens - markerTokens);
  const targetChars = Math.max(0, contentTokens * 4);

  return {
    ...block,
    content: `${block.content.slice(0, targetChars).trimEnd()}${marker}`,
    tokenEstimate: targetTokens,
    metadata: {
      ...(block.metadata ?? {}),
      truncated: true,
      originalTokenEstimate: block.tokenEstimate
    }
  };
}

function sumTokens(blocks: readonly ContextBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.tokenEstimate, 0);
}

function orderForRender(blocks: readonly ContextBlock[]): ContextBlock[] {
  return [...blocks].sort((left, right) => {
    const stable = Number(right.cacheStable) - Number(left.cacheStable);
    if (stable !== 0) return stable;
    const rank = renderRank(left) - renderRank(right);
    if (rank !== 0) return rank;
    return left.id.localeCompare(right.id);
  });
}

function renderRank(block: ContextBlock): number {
  const ranks: Partial<Record<ContextBlockType, number>> = {
    system: 0,
    session: 1,
    memory: 2,
    summary: 3,
    plan: 4,
    file: 5,
    tool: 6,
    conversation: 7,
    custom: 8
  };
  return ranks[block.type] ?? 99;
}

function renderSections(blocks: readonly ContextBlock[]): RenderedSection[] {
  return blocks.map((block) => ({
    title: sectionTitleForBlock(block),
    content: block.content,
    blockIds: [block.id],
    cacheStable: block.cacheStable
  }));
}

function sectionTitleForBlock(block: ContextBlock): string {
  const titles: Partial<Record<ContextBlockType, string>> = {
    file: "File Context",
    conversation: "Conversation",
    memory: "Memory",
    session: "Session",
    system: "System",
    plan: "Plan",
    tool: "Tool Result",
    summary: "Summary"
  };
  return titles[block.type] ?? readableTitle(block.type);
}

function readableTitle(type: string): string {
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderMessages(blocks: readonly ContextBlock[]): RenderedMessage[] {
  return blocks.map((block) => ({
    role: roleForBlock(block),
    content: block.content,
    blockIds: [block.id],
    cacheStable: block.cacheStable
  }));
}

function roleForBlock(block: ContextBlock): RenderedRole {
  if (block.type === "system" || block.type === "session" || block.type === "memory") return "system";
  if (block.type === "tool" || block.type === "file") return "tool";
  if (block.metadata?.role === "assistant") return "assistant";
  return "user";
}
}

namespace __core_artifacts_htmlRenderer {
import sanitizeContent = __core_core_artifactManager.sanitizeContent;
export function renderHtml(content: string): string {
  return sanitizeContent("html", content);
}
}

namespace __core_artifacts_artifactTypes {

export const artifactRendererTypes = ["markdown", "html", "code", "report", "newspaper"] as const;
}

namespace __core_artifacts_markdownRenderer {

export function renderMarkdown(content: string): string {
  return content;
}
}

namespace __core_artifacts_newspaperRenderer {
import sanitizeContent = __core_core_artifactManager.sanitizeContent;
export function renderNewspaper(content: string): string {
  return sanitizeContent(
    "newspaper",
    `<article class="newspaper"><style>.newspaper{columns:2;line-height:1.55}</style>${content}</article>`
  );
}
}

namespace __core_config_envFileStore {
import existsSync = __ext_5.existsSync;
import readFileSync = __ext_5.readFileSync;
import mkdir = __ext_9.mkdir;
import readFile = __ext_9.readFile;
import rename = __ext_9.rename;
import writeFile = __ext_9.writeFile;
import dirname = __ext_8.dirname;
import join = __ext_8.join;
const workspacePackageNames = new Set(["pinocchio", "deepseek-workbench-v2"]);

export interface EnvFileSettings {
  hasApiKey: boolean;
  maskedApiKey: string | null;
}

export interface WorkbenchEnvFileSettings {
  deepSeek: EnvFileSettings;
}

export interface IntegrationPathSettings {
  configured: boolean;
  path: string | null;
}

export interface ObsidianIntegrationSettings {
  configured: boolean;
  vaultPath: string | null;
  exportFolder: string;
}

export interface WorkbenchIntegrationSettings {
  pluginDir: IntegrationPathSettings;
  obsidian: ObsidianIntegrationSettings;
}

export interface SaveWorkbenchIntegrationsInput {
  pluginDir?: string | null | undefined;
  obsidianVaultPath?: string | null | undefined;
  obsidianExportFolder?: string | null | undefined;
}

export type EnvApiKeyName = "DEEPSEEK_API_KEY";

export async function saveDeepSeekApiKey(apiKey: string, cwd = process.cwd()): Promise<EnvFileSettings> {
  return saveEnvApiKey("DEEPSEEK_API_KEY", apiKey, cwd);
}

export async function saveDeepSeekBudgetLimit(currency: "CNY" | "USD", limit: number, cwd = process.cwd()): Promise<number> {
  const envPath = process.env.WORKBENCH_ENV_FILE_PATH?.trim() || join(findWorkspaceRoot(cwd), ".env.local");
  const envKey = currency === "CNY" ? "DEEPSEEK_SESSION_BUDGET_CNY" : "DEEPSEEK_SESSION_BUDGET_USD";
  await upsertEnvValue(envPath, envKey, String(limit));
  process.env[envKey] = String(limit);
  return limit;
}

export async function saveWorkbenchIntegrations(input: SaveWorkbenchIntegrationsInput, cwd = process.cwd()): Promise<WorkbenchIntegrationSettings> {
  const envPath = process.env.WORKBENCH_ENV_FILE_PATH?.trim() || join(findWorkspaceRoot(cwd), ".env.local");
  const updates: Record<string, string | null> = {
    WORKBENCH_PLUGIN_DIR: normalizeOptionalPath(input.pluginDir),
    OBSIDIAN_VAULT_PATH: normalizeOptionalPath(input.obsidianVaultPath),
    OBSIDIAN_EXPORT_FOLDER: normalizeOptionalText(input.obsidianExportFolder) ?? "AI Workbench"
  };
  await upsertEnvValues(envPath, updates);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  return describeWorkbenchIntegrations();
}

export async function saveEnvApiKey(envKey: EnvApiKeyName, apiKey: string, cwd = process.cwd()): Promise<EnvFileSettings> {
  const envPath = process.env.WORKBENCH_ENV_FILE_PATH?.trim() || join(findWorkspaceRoot(cwd), ".env.local");
  const value = apiKey.trim();
  await upsertEnvValue(envPath, envKey, value);
  process.env[envKey] = value;
  return describeApiKey(value);
}

export function describeApiKey(apiKey = process.env.DEEPSEEK_API_KEY): EnvFileSettings {
  const value = apiKey?.trim() ?? "";
  return { hasApiKey: value.length > 0, maskedApiKey: value ? maskApiKey(value) : null };
}

export function describeEnvApiKey(envKey: EnvApiKeyName): EnvFileSettings {
  return describeApiKey(process.env[envKey]);
}

export function describeWorkbenchApiKeys(): WorkbenchEnvFileSettings {
  return {
    deepSeek: describeEnvApiKey("DEEPSEEK_API_KEY")
  };
}

export function describeWorkbenchIntegrations(): WorkbenchIntegrationSettings {
  const pluginDir = normalizeOptionalPath(process.env.WORKBENCH_PLUGIN_DIR);
  const vaultPath = normalizeOptionalPath(process.env.OBSIDIAN_VAULT_PATH);
  const exportFolder = normalizeOptionalText(process.env.OBSIDIAN_EXPORT_FOLDER) ?? "AI Workbench";
  return {
    pluginDir: { configured: Boolean(pluginDir), path: pluginDir },
    obsidian: { configured: Boolean(vaultPath), vaultPath, exportFolder }
  };
}

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      const text = readFileSync(packagePath, "utf8");
      if (workspacePackageNames.has(readPackageName(text))) return current;
    }
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

function readPackageName(text: string): string {
  try {
    const parsed = JSON.parse(text) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : "";
  } catch {
    return "";
  }
}

async function upsertEnvValue(filePath: string, key: string, value: string): Promise<void> {
  await upsertEnvValues(filePath, { [key]: value });
}

async function upsertEnvValues(filePath: string, updates: Record<string, string | null>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const existing = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(updates));
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1];
    if (!key || !remaining.has(key)) return line;
    const value = remaining.get(key) ?? null;
    remaining.delete(key);
    return value === null ? "" : `${key}=${quoteEnvValue(value)}`;
  });
  for (const [key, value] of remaining) {
    if (value === null) continue;
    if (nextLines.length && nextLines.at(-1) !== "") nextLines.push("");
    nextLines.push(`${key}=${quoteEnvValue(value)}`);
  }
  const next = `${nextLines.filter((line, index, array) => line !== "" || array[index - 1] !== "").join("\n").replace(/\n+$/, "")}\n`;
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tempPath, next, "utf8");
  await rename(tempPath, filePath);
}

function maskApiKey(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function quoteEnvValue(value: string): string {
  return JSON.stringify(value);
}

function normalizeOptionalPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
}

export type ActionPolicyResult = __core_agents_agentPolicy.ActionPolicyResult;
export type AgentAction = __core_agents_agentPolicy.AgentAction;
export type AgentInput = __core_agents_baseAgent.AgentInput;
export type AgentMode = __core_agents_agentPolicy.AgentMode;
export type AgentOutput = __core_agents_baseAgent.AgentOutput;
export const analyzeContradictions = __core_research_synthesis.analyzeContradictions;
export type AppEnv = __core_config_env.AppEnv;
export type ApplyPatchAction = __core_agents_agentPolicy.ApplyPatchAction;
export import ArtifactManager = __core_core_artifactManager.ArtifactManager;
export const artifactRendererTypes = __core_artifacts_artifactTypes.artifactRendererTypes;
export type ArtifactScope = __core_core_artifactManager.ArtifactScope;
export const assertPublicHttpUrl = __core_tools_web_fetcher_security.assertPublicHttpUrl;
export type AssetBlobRow = __core_canvasStudio_canvasStudioRows.AssetBlobRow;
export type AssetRow = __core_canvasStudio_canvasStudioRows.AssetRow;
export const autoLayoutContent = __core_canvas_canvasText.autoLayoutContent;
export type AutoReviewInput = __core_methodology_autoReview.AutoReviewInput;
export import AutoReviewService = __core_methodology_autoReview.AutoReviewService;
export import BaseAgent = __core_agents_baseAgent.BaseAgent;
export type BlockBuilderInput = __core_context_assembler.BlockBuilderInput;
export import BudgetLimitError = __core_usage_budget.BudgetLimitError;
export type BudgetOptions = __core_context_assembler.BudgetOptions;
export import BudgetService = __core_usage_budget.BudgetService;
export type BudgetUsage = __core_context_assembler.BudgetUsage;
export const buildDeckSpec = __core_canvas_canvasDeck.buildDeckSpec;
export const buildDeepSeekRequestBody = __core_core_llmClient.buildDeepSeekRequestBody;
export const buildEvidence = __core_research_synthesis.buildEvidence;
export const buildPlanMethodology = __core_methodology_planContent.buildPlanMethodology;
export const buildPriorityMatrix = __core_methodology_priorityMatrix.buildPriorityMatrix;
export const canPersistMemory = __core_safety_permissions.canPersistMemory;
export import CanvasAssetRegistry = __core_canvasStudio_canvasAssetRegistry.CanvasAssetRegistry;
export const canvasContentToDocxBase64 = __core_canvas_canvasDocx.canvasContentToDocxBase64;
export const canvasContentToHtml = __core_canvas_canvasText.canvasContentToHtml;
export const canvasContentToMarkdown = __core_canvas_canvasText.canvasContentToMarkdown;
export const canvasContentToPptxBase64 = __core_canvas_canvasPptx.canvasContentToPptxBase64;
export const canvasContentToText = __core_canvas_canvasText.canvasContentToText;
export type CanvasDecision = __core_canvas_canvasDecisionService.CanvasDecision;
export import CanvasDecisionService = __core_canvas_canvasDecisionService.CanvasDecisionService;
export import CanvasRevisionStore = __core_canvas_canvasRevisionStore.CanvasRevisionStore;
export type CanvasRow = __core_storage_sqliteRows.CanvasRow;
export type CanvasServerExportFormat = __core_canvas_canvasExport.CanvasServerExportFormat;
export import CanvasService = __core_canvas_canvasService.CanvasService;
export import CanvasStore = __core_canvas_canvasStore.CanvasStore;
export type CanvasStreamTarget = __core_core_chatEngineOutput.CanvasStreamTarget;
export import CanvasStudioStore = __core_canvasStudio_canvasStudioStore.CanvasStudioStore;
export const canvasSummary = __core_canvas_canvasText.canvasSummary;
export type CardRow = __core_storage_sqliteRows.CardRow;
export import CardStore = __core_cards_cardStore.CardStore;
export const chatCompactionBudget = __core_core_chatEngineBudget.chatCompactionBudget;
export import ChatEngine = __core_core_chatEngine.ChatEngine;
export type ChatEngineDeps = __core_core_chatEngine.ChatEngineDeps;
export type ChatMethodologyDeps = __core_core_chatMethodology.ChatMethodologyDeps;
export const chatMode = __core_modes_chatMode.chatMode;
export const chunkToolCalls = __core_core_chatEngineToolLoop.chunkToolCalls;
export const clampPositiveInteger = __core_tools_web_defaults.clampPositiveInteger;
export const classifyCommandRisk = __core_agents_agentPolicy.classifyCommandRisk;
export const classifyContextKind = __core_context_contextLabels.classifyContextKind;
export const classifyWorkflow = __core_methodology_workflow.classifyWorkflow;
export import CoderAgent = __core_agents_coderAgent.CoderAgent;
export import CodeVerificationService = __core_methodology_codingVerification.CodeVerificationService;
export const codingMethodPrompt = __core_methodology_coreDisciplines.codingMethodPrompt;
export const codingModeCapabilities = __core_modes_codingMode.codingModeCapabilities;
export type CommandRisk = __core_agents_agentPolicy.CommandRisk;
export const compactChatMessages = __core_core_chatEngineRequest.compactChatMessages;
export const compactTaskTitle = __core_utils_title.compactTaskTitle;
export const comparePromptSections = __core_core_promptSections.comparePromptSections;
export type ComposePromptSectionOptions = __core_core_promptSections.ComposePromptSectionOptions;
export const composePromptSections = __core_core_promptSections.composePromptSections;
export const conservativePricing = __core_pricing_deepSeekPricing.conservativePricing;
export import ContentAddressedAssetStore = __core_canvasStudio_contentAddressedAssetStore.ContentAddressedAssetStore;
export import ContextAssembler = __core_context_assembler.ContextAssembler;
export type ContextAssemblerOptions = __core_context_assembler.ContextAssemblerOptions;
export type ContextAssemblyResult = __core_context_assembler.ContextAssemblyResult;
export type ContextBlock = __core_context_assembler.ContextBlock;
export type ContextBlockType = __core_context_assembler.ContextBlockType;
export type ContextBudget = __core_core_contextManager.ContextBudget;
export type ContextDiagnostic = __core_context_assembler.ContextDiagnostic;
export const contextLabelPrompt = __core_context_contextLabels.contextLabelPrompt;
export import ContextManager = __core_core_contextManager.ContextManager;
export type ContextSource = __core_context_assembler.ContextSource;
export import ContextStore = __core_context_contextStore.ContextStore;
export type Contradiction = __core_research_types.Contradiction;
export type ContradictionItem = __core_methodology_methodologyRepository.ContradictionItem;
export const ContradictionSchema = __core_research_types.ContradictionSchema;
export const conversationBlock = __core_context_assembler.conversationBlock;
export type ConversationDraft = __core_storage_sqliteDatabase.ConversationDraft;
export type ConversationRow = __core_storage_sqliteRows.ConversationRow;
export import ConversationStore = __core_conversations_conversationStore.ConversationStore;
export import ConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.ConversationWorkspaceDatabase;
export import ConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.ConversationWorkspaceStore;
export import CoordinatorAgent = __core_agents_coordinatorAgent.CoordinatorAgent;
export type CoordinatorEvent = __core_methodology_multiPassCoordinator.CoordinatorEvent;
export const coordinatorPromptContext = __core_core_chatMethodology.coordinatorPromptContext;
export type CoordinatorPromptContext = __core_core_chatMethodology.CoordinatorPromptContext;
export type CoordinatorResult = __core_methodology_multiPassCoordinator.CoordinatorResult;
export type CoordinatorRole = __core_methodology_multiPassCoordinator.CoordinatorRole;
export const coreDisciplines = __core_methodology_coreDisciplines.coreDisciplines;
export const countMessagesForBudget = __core_core_chatEngineBudget.countMessagesForBudget;
export const createArtifactTool = __core_tools_artifactTool.createArtifactTool;
export const createBootstrapAssessmentTool = __core_tools_methodologyTools.createBootstrapAssessmentTool;
export const createCodeExecutionTool = __core_tools_codeExecutionTool.createCodeExecutionTool;
export const createCurrentTimeTool = __core_tools_currentTimeTool.createCurrentTimeTool;
export const createDeepSeekOfficialNewsTool = __core_tools_deepSeekOfficialNewsTool.createDeepSeekOfficialNewsTool;
export const createFeedbackSynthesisTool = __core_tools_methodologyTools.createFeedbackSynthesisTool;
export const createFileReaderTool = __core_tools_fileReaderTool.createFileReaderTool;
export const createId = __core_utils_id.createId;
export const createInvestigationTool = __core_tools_methodologyTools.createInvestigationTool;
export const createLongTextTool = __core_tools_longTextTool.createLongTextTool;
export const createMemoryTool = __core_tools_memoryTool.createMemoryTool;
export const createObsidianExportTool = __core_tools_obsidianExportTool.createObsidianExportTool;
export const createPriorityMatrixTool = __core_tools_methodologyTools.createPriorityMatrixTool;
export const createPromptSnapshot = __core_context_promptSnapshot.createPromptSnapshot;
export const createResearchPlan = __core_research_synthesis.createResearchPlan;
export const createRuntime = __core_runtime.createRuntime;
export const createRuntimeCanvas = __core_runtime_canvasFactory.createRuntimeCanvas;
export const createRuntimeChatEngine = __core_runtime_chatFactory.createRuntimeChatEngine;
export const createRuntimeLlm = __core_runtime_llmFactory.createRuntimeLlm;
export const createRuntimePlanTask = __core_runtime_planTaskFactory.createRuntimePlanTask;
export const createRuntimeResearch = __core_runtime_researchFactory.createRuntimeResearch;
export const createRuntimeStorage = __core_runtime_storageFactory.createRuntimeStorage;
export const createRuntimeTools = __core_runtime_toolFactory.createRuntimeTools;
export const createWebFetchTool = __core_tools_webFetchTool.createWebFetchTool;
export const createWebSearchTool = __core_tools_webFetchTool.createWebSearchTool;
export type CritiqueIssue = __core_research_types.CritiqueIssue;
export const CritiqueIssueSchema = __core_research_types.CritiqueIssueSchema;
export const critiqueResearchResult = __core_research_critique.critiqueResearchResult;
export type CritiqueResult = __core_research_types.CritiqueResult;
export const CritiqueResultSchema = __core_research_types.CritiqueResultSchema;
export const customBlock = __core_context_assembler.customBlock;
export const deckProjectFiles = __core_canvas_canvasDeck.deckProjectFiles;
export type DeepResearchDeps = __core_research_deepResearchService.DeepResearchDeps;
export type DeepResearchResult = __core_research_deepResearchService.DeepResearchResult;
export import DeepResearchService = __core_research_deepResearchService.DeepResearchService;
export import DeepSeekLLMClient = __core_core_llmClient.DeepSeekLLMClient;
export type DeepSeekOfficialNewsItem = __core_tools_deepSeekOfficialNewsTool.DeepSeekOfficialNewsItem;
export import DeepSeekPricingService = __core_pricing_deepSeekPricing.DeepSeekPricingService;
export import DeepSeekTokenCounter = __core_tokenizer_deepSeekTokenCounter.DeepSeekTokenCounter;
export const deepSeekV4ContextBudgetTokens = __core_core_contextManager.deepSeekV4ContextBudgetTokens;
export const deepSeekV4MaxOutputTokens = __core_core_contextManager.deepSeekV4MaxOutputTokens;
export const DEFAULT_MAX_BYTES = __core_tools_web_defaults.DEFAULT_MAX_BYTES;
export const DEFAULT_MAX_CHARS = __core_tools_web_defaults.DEFAULT_MAX_CHARS;
export const DEFAULT_MAX_REDIRECTS = __core_tools_web_defaults.DEFAULT_MAX_REDIRECTS;
export const DEFAULT_MAX_SEARCH_RESULTS = __core_tools_web_defaults.DEFAULT_MAX_SEARCH_RESULTS;
export const DEFAULT_PROVIDER_ORDER = __core_tools_web_providers_registry.DEFAULT_PROVIDER_ORDER;
export const DEFAULT_SKILL_SOURCE_ROOT = __core_capabilities_skillSourceInventory.DEFAULT_SKILL_SOURCE_ROOT;
export const DEFAULT_TIMEOUT_MS = __core_tools_web_defaults.DEFAULT_TIMEOUT_MS;
export const DEFAULT_TOP_K = __core_tools_web_defaults.DEFAULT_TOP_K;
export const defaultEngine = __core_canvasStudio_canvasStudioRows.defaultEngine;
export const defaultLimits = __core_safety_limits.defaultLimits;
export const describeApiKey = __core_config_envFileStore.describeApiKey;
export const describeEnvApiKey = __core_config_envFileStore.describeEnvApiKey;
export const describeWorkbenchApiKeys = __core_config_envFileStore.describeWorkbenchApiKeys;
export const describeWorkbenchIntegrations = __core_config_envFileStore.describeWorkbenchIntegrations;
export const detectWorkspaceFileType = __core_files_fileMime.detectWorkspaceFileType;
export type DraftToolCall = __core_core_streamToolCalls.DraftToolCall;
export import DuckDuckGoHtmlProvider = __core_tools_web_providers_duckduckgo.DuckDuckGoHtmlProvider;
export type DuckDuckGoParseContext = __core_tools_web_providers_duckduckgo.DuckDuckGoParseContext;
export type DuckDuckGoProviderConfig = __core_tools_web_providers_duckduckgo.DuckDuckGoProviderConfig;
export import EmotionDetector = __core_core_emotionDetector.EmotionDetector;
export type EmotionIntensity = __core_core_emotionDetector.EmotionIntensity;
export type EmotionState = __core_core_emotionDetector.EmotionState;
export const emptyCanvasContent = __core_canvas_canvasText.emptyCanvasContent;
export const emptyUsageSummary = __core_usage_modelUsage.emptyUsageSummary;
export const ensureBudgetForChatRequest = __core_core_chatEngineBudget.ensureBudgetForChatRequest;
export type EnvApiKeyName = __core_config_envFileStore.EnvApiKeyName;
export type EnvFileSettings = __core_config_envFileStore.EnvFileSettings;
export const EnvSchema = __core_config_env.EnvSchema;
export const estimateContextTokens = __core_context_assembler.estimateContextTokens;
export const estimateTextTokens = __core_core_contextManager.estimateTextTokens;
export const evaluateActionPolicy = __core_agents_agentPolicy.evaluateActionPolicy;
export type Evidence = __core_research_types.Evidence;
export type EvidenceItem = __core_methodology_methodologyRepository.EvidenceItem;
export const EvidenceSchema = __core_research_types.EvidenceSchema;
export const exportCanvasContent = __core_canvas_canvasExport.exportCanvasContent;
export type ExportJobRow = __core_canvasStudio_canvasStudioRows.ExportJobRow;
export const externalMaterialsToResearchMaterials = __core_research_sourceProvider.externalMaterialsToResearchMaterials;
export type ExtractedContent = __core_tools_web_extract_html.ExtractedContent;
export const extractHtml = __core_tools_web_extract_html.extractHtml;
export type ExtractHtmlOptions = __core_tools_web_extract_html.ExtractHtmlOptions;
export const extractPatchPaths = __core_agents_agentPolicy.extractPatchPaths;
export type FeedbackSynthesis = __core_methodology_methodologyRepository.FeedbackSynthesis;
export const fetchedTextToMaterial = __core_research_sourceProvider.fetchedTextToMaterial;
export const fetchFallbackToMaterial = __core_research_sourceProvider.fetchFallbackToMaterial;
export type FetchLike = __core_core_llmClient.FetchLike;
export type FetchOptions = __core_tools_web_types.FetchOptions;
export import FetchSecurityError = __core_tools_web_errors.FetchSecurityError;
export const fileBlock = __core_context_assembler.fileBlock;
export const fileReaderError = __core_files_fileReaderErrors.fileReaderError;
export import FileReaderError = __core_files_fileReaderErrors.FileReaderError;
export type FileReaderErrorCode = __core_files_fileReaderErrors.FileReaderErrorCode;
export type FileRow = __core_canvasStudio_canvasStudioRows.FileRow;
export const fileSnippetBlock = __core_context_assembler.fileSnippetBlock;
export import FileStore = __core_files_fileStore.FileStore;
export type FileUploadLimits = __core_files_fileStore.FileUploadLimits;
export type Finding = __core_research_types.Finding;
export const FindingSchema = __core_research_types.FindingSchema;
export const fingerprintBlocks = __core_context_fingerprint.fingerprintBlocks;
export type FinishAction = __core_agents_agentPolicy.FinishAction;
export type FocusLock = __core_methodology_methodologyRepository.FocusLock;
export const getEnv = __core_config_env.getEnv;
export import HttpPageFetcher = __core_tools_web_fetcher_http.HttpPageFetcher;
export const inferCanvasKind = __core_canvas_canvasText.inferCanvasKind;
export const inferPhase = __core_methodology_workflow.inferPhase;
export const initializeWorkbenchDatabase = __core_storage_sqliteSchema.initializeWorkbenchDatabase;
export type IntegrationPathSettings = __core_config_envFileStore.IntegrationPathSettings;
export import IntentRouter = __core_core_intentRouter.IntentRouter;
export const isBlockedAddress = __core_tools_web_fetcher_security.isBlockedAddress;
export const isConversationWorkspaceDatabase = __core_storage_conversationWorkspaceStore.isConversationWorkspaceDatabase;
export const isConversationWorkspaceStore = __core_storage_conversationWorkspaceStore.isConversationWorkspaceStore;
export const isModelToolName = __core_core_toolRouter.isModelToolName;
export const isReasoningMode = __core_config_models.isReasoningMode;
export const isWorkspacePathAllowed = __core_files_pathSecurity.isWorkspacePathAllowed;
export type JsonObject = __core_canvasStudio_canvasStudioRows.JsonObject;
export const lastUser = __core_core_chatEngineOutput.lastUser;
export const legacyArtifactCanvasId = __core_canvas_legacyArtifactCanvas.legacyArtifactCanvasId;
export type LegacyArtifactCanvasMatch = __core_canvas_legacyArtifactCanvas.LegacyArtifactCanvasMatch;
export const legacyArtifactIdFromCanvasId = __core_canvas_legacyArtifactCanvas.legacyArtifactIdFromCanvasId;
export const legacyArtifactsForConversation = __core_canvas_legacyArtifactCanvas.legacyArtifactsForConversation;
export const legacyArtifactToCanvas = __core_canvas_legacyArtifactCanvas.legacyArtifactToCanvas;
export type ListFilesAction = __core_agents_agentPolicy.ListFilesAction;
export type LLMClient = __core_core_llmClient.LLMClient;
export type LLMRequest = __core_core_llmClient.LLMRequest;
export type LLMResponse = __core_core_llmClient.LLMResponse;
export type LLMStreamDelta = __core_core_llmClient.LLMStreamDelta;
export type LoadedPlugin = __core_plugins_pluginManager.LoadedPlugin;
export import LocalJsonStorageAdapter = __core_storage_localJsonStorageAdapter.LocalJsonStorageAdapter;
export const localRestrictedRunnerNotice = __core_safety_sandbox.localRestrictedRunnerNotice;
export const materializeToolCalls = __core_core_streamToolCalls.materializeToolCalls;
export const memoryBlock = __core_context_assembler.memoryBlock;
export import MemoryPolicy = __core_memory_memoryPolicy.MemoryPolicy;
export import MemoryStore = __core_memory_memoryStore.MemoryStore;
export const mergeToolCallDeltas = __core_core_streamToolCalls.mergeToolCallDeltas;
export const mergeUsageSummaries = __core_usage_modelUsage.mergeUsageSummaries;
export type MessageRow = __core_storage_sqliteRows.MessageRow;
export type MethodologyLabel<T extends string> = __core_methodology_workflow.MethodologyLabel<T>;
export import MethodologyRepository = __core_methodology_methodologyRepository.MethodologyRepository;
export type MethodologyRow = __core_canvasStudio_canvasStudioRows.MethodologyRow;
export const migrateLegacyConversationWorkspace = __core_storage_conversationWorkspaceMigration.migrateLegacyConversationWorkspace;
export import MockLLMClient = __core_core_mockLLMClient.MockLLMClient;
export type ModeHandler = __core_modes_types.ModeHandler;
export type ModelToolSchema = __core_core_llmClient.ModelToolSchema;
export type ModeResult = __core_modes_types.ModeResult;
export import MultiPassCoordinator = __core_methodology_multiPassCoordinator.MultiPassCoordinator;
export type NodeRow = __core_canvasStudio_canvasStudioRows.NodeRow;
export const normalizeAllowedPaths = __core_files_pathSecurity.normalizeAllowedPaths;
export const normalizeDeepSeekUsage = __core_usage_modelUsage.normalizeDeepSeekUsage;
export const normalizeRelativeInput = __core_files_pathSecurity.normalizeRelativeInput;
export const normalizeThinking = __core_config_models.normalizeThinking;
export const nowIso = __core_utils_id.nowIso;
export type ObsidianExportBridge = __core_tools_obsidianExportTool.ObsidianExportBridge;
export type ObsidianExportInput = __core_obsidian_obsidianVaultBridge.ObsidianExportInput;
export type ObsidianExportResult = __core_obsidian_obsidianVaultBridge.ObsidianExportResult;
export type ObsidianIntegrationSettings = __core_config_envFileStore.ObsidianIntegrationSettings;
export import ObsidianVaultBridge = __core_obsidian_obsidianVaultBridge.ObsidianVaultBridge;
export type ObsidianVaultBridgeOptions = __core_obsidian_obsidianVaultBridge.ObsidianVaultBridgeOptions;
export type OutputRow = __core_canvasStudio_canvasStudioRows.OutputRow;
export type PageContent = __core_tools_web_types.PageContent;
export type PageContentFormat = __core_tools_web_types.PageContentFormat;
export type PageContentLike = __core_research_types.PageContentLike;
export const pageContentsToMaterials = __core_research_sourceProvider.pageContentsToMaterials;
export type PageFetcher = __core_tools_web_types.PageFetcher;
export const parseBing = __core_tools_webFetchTool.parseBing;
export const parseDeepSeekDiscountExpiresAt = __core_pricing_deepSeekPricing.parseDeepSeekDiscountExpiresAt;
export const parseDeepSeekOfficialNews = __core_tools_deepSeekOfficialNewsTool.parseDeepSeekOfficialNews;
export const parseDeepSeekPricingPage = __core_pricing_deepSeekPricing.parseDeepSeekPricingPage;
export const parseDuckDuckGo = __core_tools_webFetchTool.parseDuckDuckGo;
export const parseDuckDuckGoHtmlResults = __core_tools_web_providers_duckduckgo.parseDuckDuckGoHtmlResults;
export const parseObject = __core_canvasStudio_canvasStudioRows.parseObject;
export const parsePlanMethodology = __core_methodology_planContent.parsePlanMethodology;
export type PathPolicyResult = __core_agents_agentPolicy.PathPolicyResult;
export const persistMemoryCandidates = __core_core_chatEngineMemory.persistMemoryCandidates;
export type PhaseType = __core_methodology_workflow.PhaseType;
export const planBlock = __core_context_assembler.planBlock;
export type PlanDraft = __core_storage_sqliteDatabase.PlanDraft;
export type PlanExecutionResult = __core_plans_planService.PlanExecutionResult;
export type PlanMethodologyMetadata = __core_methodology_planContent.PlanMethodologyMetadata;
export const planningMethodPrompt = __core_methodology_coreDisciplines.planningMethodPrompt;
export const planningModeActions = __core_modes_planningMode.planningModeActions;
export type PlanningStep = __core_modes_planningMode.PlanningStep;
export type PlanResult = __core_plans_planService.PlanResult;
export type PlanRow = __core_storage_sqliteRows.PlanRow;
export import PlanService = __core_plans_planService.PlanService;
export type PlanStepRow = __core_storage_sqliteRows.PlanStepRow;
export import PlanStore = __core_plans_planStore.PlanStore;
export type PluginLoadStatus = __core_plugins_pluginManager.PluginLoadStatus;
export import PluginManager = __core_plugins_pluginManager.PluginManager;
export type PluginManagerOptions = __core_plugins_pluginManager.PluginManagerOptions;
export const preflightChat = __core_core_chatPreflight.preflightChat;
export const prepareChatRequest = __core_core_chatEngineRequest.prepareChatRequest;
export type PriorityItem = __core_methodology_priorityMatrix.PriorityItem;
export type PriorityStatus = __core_methodology_priorityMatrix.PriorityStatus;
export type ProjectRow = __core_canvasStudio_canvasStudioRows.ProjectRow;
export import PromptManager = __core_core_promptManager.PromptManager;
export type PromptSection = __core_core_promptSections.PromptSection;
export type PromptSnapshot = __core_context_promptSnapshot.PromptSnapshot;
export type ProviderDiagnostics = __core_tools_web_types.ProviderDiagnostics;
export type ProviderFailure = __core_tools_web_types.ProviderFailure;
export import ProviderSearchError = __core_tools_web_errors.ProviderSearchError;
export type ProviderUserAction = __core_tools_web_types.ProviderUserAction;
export type ReadFileAction = __core_agents_agentPolicy.ReadFileAction;
export const remainingToolExecutions = __core_core_chatEngineToolLoop.remainingToolExecutions;
export type RenderedMessage = __core_context_assembler.RenderedMessage;
export type RenderedRole = __core_context_assembler.RenderedRole;
export type RenderedSection = __core_context_assembler.RenderedSection;
export const renderHtml = __core_artifacts_htmlRenderer.renderHtml;
export type RenderJobRow = __core_canvasStudio_canvasStudioRows.RenderJobRow;
export const renderMarkdown = __core_artifacts_markdownRenderer.renderMarkdown;
export const renderNewspaper = __core_artifacts_newspaperRenderer.renderNewspaper;
export const renderPlanContent = __core_methodology_planContent.renderPlanContent;
export const renderPromptSection = __core_core_promptSections.renderPromptSection;
export const repairTruncatedJson = __core_core_toolCallRepair.repairTruncatedJson;
export import ResearcherAgent = __core_agents_researcherAgent.ResearcherAgent;
export type ResearchMaterial = __core_research_types.ResearchMaterial;
export const ResearchMaterialSchema = __core_research_types.ResearchMaterialSchema;
export type ResearchPlan = __core_research_types.ResearchPlan;
export const ResearchPlanSchema = __core_research_types.ResearchPlanSchema;
export type ResearchPlanStep = __core_research_types.ResearchPlanStep;
export const ResearchPlanStepSchema = __core_research_types.ResearchPlanStepSchema;
export type ResearchSource = __core_research_types.ResearchSource;
export type ResearchSourceProvider = __core_research_types.ResearchSourceProvider;
export const ResearchSourceSchema = __core_research_types.ResearchSourceSchema;
export type ResearchSynthesisResult = __core_research_types.ResearchSynthesisResult;
export const ResearchSynthesisResultSchema = __core_research_types.ResearchSynthesisResultSchema;
export const resolveDbPath = __core_storage_sqliteDatabase.resolveDbPath;
export type ResolvedWorkspacePath = __core_files_pathSecurity.ResolvedWorkspacePath;
export const resolveWorkspaceDataDir = __core_storage_conversationWorkspaceStore.resolveWorkspaceDataDir;
export const resolveWorkspacePath = __core_agents_agentPolicy.resolveWorkspacePath;
export type ResolveWorkspacePathOptions = Parameters<typeof __core_agents_agentPolicy.resolveWorkspacePath>[0];
export type ReviewRow = __core_canvasStudio_canvasStudioRows.ReviewRow;
export type RunCommandAction = __core_agents_agentPolicy.RunCommandAction;
export const runLocalRestricted = __core_tools_codeExecutionTool.runLocalRestricted;
export const runResearchSynthesis = __core_research_synthesis.runResearchSynthesis;
export const sanitizeContent = __core_core_artifactManager.sanitizeContent;
export const sanitizeLegacyStageText = __core_research_sourceProvider.sanitizeLegacyStageText;
export const sanitizeResearchSource = __core_research_sourceProvider.sanitizeResearchSource;
export const sanitizeToolArguments = __core_core_chatEngineToolLoop.sanitizeToolArguments;
export const saveDeepSeekApiKey = __core_config_envFileStore.saveDeepSeekApiKey;
export const saveDeepSeekBudgetLimit = __core_config_envFileStore.saveDeepSeekBudgetLimit;
export const saveEnvApiKey = __core_config_envFileStore.saveEnvApiKey;
export const saveWorkbenchIntegrations = __core_config_envFileStore.saveWorkbenchIntegrations;
export type SaveWorkbenchIntegrationsInput = __core_config_envFileStore.SaveWorkbenchIntegrationsInput;
export const scanSkillSourceInventory = __core_capabilities_skillSourceInventory.scanSkillSourceInventory;
export type SearchAndFetchResponseLike = __core_research_types.SearchAndFetchResponseLike;
export const searchAndFetchResponseToMaterials = __core_research_sourceProvider.searchAndFetchResponseToMaterials;
export type SearchFilesAction = __core_agents_agentPolicy.SearchFilesAction;
export type SearchOptions = __core_tools_web_types.SearchOptions;
export type SearchProvider = __core_tools_web_types.SearchProvider;
export import SearchProviderRegistry = __core_tools_web_providers_registry.SearchProviderRegistry;
export type SearchResponse = __core_tools_web_types.SearchResponse;
export type SearchResult = __core_tools_web_types.SearchResult;
export type SearchResultItem = __core_tools_webFetchTool.SearchResultItem;
export type SearchResultLike = __core_research_types.SearchResultLike;
export const searchResultsToMaterials = __core_research_sourceProvider.searchResultsToMaterials;
export type SearchSource = __core_tools_web_types.SearchSource;
export type SearchSourceResult = __core_tools_webFetchTool.SearchSourceResult;
export type SectionPriority = __core_core_promptSections.SectionPriority;
export const selectPrimaryFocus = __core_methodology_priorityMatrix.selectPrimaryFocus;
export const serializeMessageForBudget = __core_core_chatEngineBudget.serializeMessageForBudget;
export const sessionBlock = __core_context_assembler.sessionBlock;
export const sessionId = __core_core_chatEngineOutput.sessionId;
export const shouldCreateDurableOutput = __core_core_chatEngineOutput.shouldCreateDurableOutput;
export const shouldUseMockLlm = __core_runtime_llmFactory.shouldUseMockLlm;
export const snippetizeContent = __core_context_assembler.snippetizeContent;
export const stableMaterialId = __core_research_sourceProvider.stableMaterialId;
export const stableStringify = __core_context_fingerprint.stableStringify;
export import StaticResearchSourceProvider = __core_research_sourceProvider.StaticResearchSourceProvider;
export type StorageAdapter = __core_storage_storageAdapter.StorageAdapter;
export type StoredAssetBlob = __core_canvasStudio_contentAddressedAssetStore.StoredAssetBlob;
export const stringify = __core_canvasStudio_canvasStudioRows.stringify;
export const summarizeArtifact = __core_core_chatEngineOutput.summarizeArtifact;
export const summarizeCanvas = __core_core_chatEngineOutput.summarizeCanvas;
export const summarizeReasoning = __core_core_chatEngineOutput.summarizeReasoning;
export const summarizeUsage = __core_usage_modelUsage.summarizeUsage;
export const summaryBlock = __core_context_assembler.summaryBlock;
export type SynthesisOptions = __core_research_types.SynthesisOptions;
export const synthesizeFindings = __core_research_synthesis.synthesizeFindings;
export const systemBlock = __core_context_assembler.systemBlock;
export import TaskProcessor = __core_tasks_taskProcessor.TaskProcessor;
export import TaskStore = __core_tasks_taskStore.TaskStore;
export import TeacherAgent = __core_agents_teacherAgent.TeacherAgent;
export const teachingModeStrategy = __core_modes_teachingMode.teachingModeStrategy;
export const textToCanvasContent = __core_canvas_canvasText.textToCanvasContent;
export const thinkingMethodPrompt = __core_methodology_coreDisciplines.thinkingMethodPrompt;
export import ThinkingMode = __core_modes_thinkingMode.ThinkingMode;
export type ThinkingModeHooks = __core_modes_thinkingMode.ThinkingModeHooks;
export const toAsset = __core_canvasStudio_canvasStudioRows.toAsset;
export const toAssetBlob = __core_canvasStudio_canvasStudioRows.toAssetBlob;
export const toExportJob = __core_canvasStudio_canvasStudioRows.toExportJob;
export const toFile = __core_canvasStudio_canvasStudioRows.toFile;
export const toMethodology = __core_canvasStudio_canvasStudioRows.toMethodology;
export const toNode = __core_canvasStudio_canvasStudioRows.toNode;
export const toolBlock = __core_context_assembler.toolBlock;
export import ToolCallRepair = __core_core_toolCallRepair.ToolCallRepair;
export type ToolDefinition<TInput = unknown, TOutput = unknown> = __core_core_toolRouter.ToolDefinition<TInput, TOutput>;
export type ToolExecutionContext = __core_core_toolRouter.ToolExecutionContext;
export type ToolLoopLimits = __core_modes_types.ToolLoopLimits;
export type ToolRepairReport = __core_core_toolCallRepair.ToolRepairReport;
export import ToolRouter = __core_core_toolRouter.ToolRouter;
export const toolSnippetBlock = __core_context_assembler.toolSnippetBlock;
export const toOutput = __core_canvasStudio_canvasStudioRows.toOutput;
export const toProject = __core_canvasStudio_canvasStudioRows.toProject;
export const toRenderJob = __core_canvasStudio_canvasStudioRows.toRenderJob;
export const toReview = __core_canvasStudio_canvasStudioRows.toReview;
export const toVersion = __core_canvasStudio_canvasStudioRows.toVersion;
export const truncate = __core_utils_id.truncate;
export const turnUsageCost = __core_core_chatEngineBudget.turnUsageCost;
export type UsageLogEntry = __core_usage_usageStore.UsageLogEntry;
export import UsageStore = __core_usage_usageStore.UsageStore;
export import UsageTracker = __core_usage_usageTracker.UsageTracker;
export type ValidationCycle = __core_methodology_methodologyRepository.ValidationCycle;
export type VerificationAttempt = __core_methodology_codingVerification.VerificationAttempt;
export type VerificationHooks = __core_methodology_codingVerification.VerificationHooks;
export type VerificationResult = __core_methodology_codingVerification.VerificationResult;
export const verifyCodingContent = __core_core_chatMethodology.verifyCodingContent;
export type VersionRow = __core_canvasStudio_canvasStudioRows.VersionRow;
export type WebFetchOutput = __core_tools_webFetchTool.WebFetchOutput;
export type WebSearchStackConfig = __core_tools_web_types.WebSearchStackConfig;
export import WebSearchToolError = __core_tools_web_errors.WebSearchToolError;
export const withContextKind = __core_context_contextLabels.withContextKind;
export const withRepairedToolCalls = __core_core_chatEngineOutput.withRepairedToolCalls;
export import WorkbenchDatabase = __core_storage_sqliteDatabase.WorkbenchDatabase;
export type WorkbenchEnvFileSettings = __core_config_envFileStore.WorkbenchEnvFileSettings;
export type WorkbenchIntegrationSettings = __core_config_envFileStore.WorkbenchIntegrationSettings;
export type WorkflowType = __core_methodology_workflow.WorkflowType;
export type WorkspaceFileEntry = __core_files_fileReaderTypes.WorkspaceFileEntry;
export type WorkspaceFileKind = __core_files_fileReaderTypes.WorkspaceFileKind;
export import WorkspaceFileReader = __core_files_workspaceFileReader.WorkspaceFileReader;
export type WorkspaceFileReaderOptions = __core_files_fileReaderTypes.WorkspaceFileReaderOptions;
export type WorkspaceFileType = __core_files_fileReaderTypes.WorkspaceFileType;
export type WorkspaceListInput = __core_files_fileReaderTypes.WorkspaceListInput;
export type WorkspaceListResult = __core_files_fileReaderTypes.WorkspaceListResult;
export type WorkspaceReadInput = __core_files_fileReaderTypes.WorkspaceReadInput;
export type WorkspaceReadResult = __core_files_fileReaderTypes.WorkspaceReadResult;
export type WorkspaceSearchInput = __core_files_fileReaderTypes.WorkspaceSearchInput;
export type WorkspaceSearchMatch = __core_files_fileReaderTypes.WorkspaceSearchMatch;
export type WorkspaceSearchResult = __core_files_fileReaderTypes.WorkspaceSearchResult;
export type WorkspaceTypeInput = __core_files_fileReaderTypes.WorkspaceTypeInput;
export type WorkspaceTypeResult = __core_files_fileReaderTypes.WorkspaceTypeResult;
export import WriterAgent = __core_agents_writerAgent.WriterAgent;
export type WritingOptions = __core_modes_writingMode.WritingOptions;
export const WritingOptionsSchema = __core_modes_writingMode.WritingOptionsSchema;
export const zipBase64 = __core_canvas_officeZip.zipBase64;
