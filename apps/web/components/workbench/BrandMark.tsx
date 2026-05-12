import { BrainCircuitIcon } from "lucide-react";
import { useWorkbenchI18n } from "./workbenchI18n";

export function BrandMark() {
  const { t } = useWorkbenchI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[1rem] bg-primary text-primary-foreground shadow-[var(--shadow-control)]">
        <BrainCircuitIcon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">Pinocchio</div>
        <div className="truncate text-xs text-muted-foreground">{t("brand.subtitle")}</div>
      </div>
    </div>
  );
}
