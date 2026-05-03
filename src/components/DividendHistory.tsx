import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Dividend } from "@/lib/dividends";
import { formatKRW, formatUSD } from "@/lib/fx";

interface Props {
  items: Dividend[];
  loading: boolean;
  onEdit: (d: Dividend) => void;
  onChanged: () => void;
}

export const DividendHistory = ({ items, loading, onEdit, onChanged }: Props) => {
  const [pendingDelete, setPendingDelete] = useState<Dividend | null>(null);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from("dividends").delete().eq("id", pendingDelete.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("삭제되었습니다");
      onChanged();
    }
    setPendingDelete(null);
  };

  return (
    <Card className="shadow-elev-sm overflow-hidden">
      <div className="p-6 pb-3">
        <h2 className="text-lg font-semibold">입력 내역</h2>
        <p className="text-sm text-muted-foreground mt-1">최신순으로 정렬됩니다</p>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          아직 기록된 배당 내역이 없습니다.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>종목</TableHead>
                  <TableHead>분류</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">원화 환산</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {format(new Date(d.date), "yyyy.MM.dd")}
                    </TableCell>
                    <TableCell>{d.asset_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {d.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.currency === "USD" ? formatUSD(Number(d.amount)) : formatKRW(Number(d.amount))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {d.amount_krw != null ? formatKRW(Math.round(Number(d.amount_krw))) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => onEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setPendingDelete(d)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-border">
            {items.map((d) => (
              <li key={d.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{d.asset_name}</span>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {d.category}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(d.date), "yyyy.MM.dd")}
                  </div>
                  <div className="mt-2 tabular-nums font-semibold">
                    {d.currency === "USD" ? formatUSD(Number(d.amount)) : formatKRW(Number(d.amount))}
                  </div>
                  {d.amount_krw != null && d.currency === "USD" && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      ≈ {formatKRW(Math.round(Number(d.amount_krw)))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setPendingDelete(d)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 내역을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.asset_name} ({pendingDelete && format(new Date(pendingDelete.date), "yyyy.MM.dd")})
              내역이 영구적으로 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
