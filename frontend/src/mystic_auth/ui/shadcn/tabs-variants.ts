import { cva } from "class-variance-authority"

// Split out of tabs.tsx so that file only exports components
// (react-refresh/only-export-components).
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        // One continuous baseline under the whole strip (horizontal only). It
        // sits here, not on each TabsTrigger, so there is no gap between tabs.
        // TabsTrigger's active border-bottom (see tabs.tsx) overlays it, which
        // works because pb-0 puts every trigger's bottom edge flush with this
        // border. border-strong, not border-card: border-card is too faint to
        // read as a baseline in light mode.
        line: "gap-5 bg-transparent pb-0 group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-border-strong",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export { tabsListVariants }
