import { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleChartCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  preview?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export const CollapsibleChartCard = ({
  title,
  subtitle,
  icon,
  preview,
  defaultOpen = false,
  children,
}: CollapsibleChartCardProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="shadow-elev-sm overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 p-4 hover:bg-accent/40 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <div className="text-left min-w-0">
              <h3 className="font-semibold truncate">{title}</h3>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!open && preview}
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
          <div className="p-4 pt-0">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default CollapsibleChartCard;
