import { useState } from "react";
import { format, subMonths, subYears, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type RangeKey = "1m" | "3m" | "6m" | "1y" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  key: RangeKey;
}

export const computeRange = (key: Exclude<RangeKey, "custom">): DateRange => {
  const to = new Date();
  const from = startOfDay(
    key === "1m" ? subMonths(to, 1) :
    key === "3m" ? subMonths(to, 3) :
    key === "6m" ? subMonths(to, 6) :
    subYears(to, 1)
  );
  return { from, to, key };
};

const QUICK: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "1m", label: "최근 1개월" },
  { key: "3m", label: "최근 3개월" },
  { key: "6m", label: "최근 6개월" },
  { key: "1y", label: "최근 1년" },
];

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export const DateFilterBar = ({ value, onChange }: Props) => {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {QUICK.map((q) => (
        <Button
          key={q.key}
          size="sm"
          variant={value.key === q.key ? "default" : "secondary"}
          className={cn(value.key === q.key && "bg-gradient-primary hover:opacity-90")}
          onClick={() => onChange(computeRange(q.key))}
        >
          {q.label}
        </Button>
      ))}

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <Popover open={openFrom} onOpenChange={setOpenFrom}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="font-normal">
              <CalendarIcon className="h-3.5 w-3.5 mr-2" />
              {format(value.from, "yyyy.MM.dd")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={value.from}
              onSelect={(d) => {
                if (!d) return;
                onChange({ from: startOfDay(d), to: value.to, key: "custom" });
                setOpenFrom(false);
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground text-sm">~</span>
        <Popover open={openTo} onOpenChange={setOpenTo}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="font-normal">
              <CalendarIcon className="h-3.5 w-3.5 mr-2" />
              {format(value.to, "yyyy.MM.dd")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={value.to}
              onSelect={(d) => {
                if (!d) return;
                onChange({ from: value.from, to: d, key: "custom" });
                setOpenTo(false);
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
