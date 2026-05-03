import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

const norm = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, "");

export const AssetCombobox = ({ value, onChange, options, placeholder, className }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value || placeholder || "종목 선택"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
        <Command filter={(v, search) => (norm(v).includes(norm(search)) ? 1 : 0)}>
          <CommandInput
            placeholder="검색하거나 새 종목 입력"
            value={value}
            onValueChange={onChange}
          />
          <CommandList>
            <CommandEmpty>
              {value ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md"
                  onClick={() => setOpen(false)}
                >
                  새 종목 사용: <span className="font-semibold">{value}</span>
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">등록된 종목이 없어요</span>
              )}
            </CommandEmpty>
            {options.length > 0 && (
              <CommandGroup heading="기존 종목">
                {options.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={(v) => {
                      onChange(v);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === opt ? "opacity-100" : "opacity-0")} />
                    {opt}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
