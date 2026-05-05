import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Dividend } from "@/lib/dividends";
import { DividendForm } from "./DividendForm"; // 👈 이전에 찾은 폼을 가져옵니다.

export const DividendHistoryManager = () => {
  const [data, setData] = useState<Dividend[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<Dividend | null>(null); // 수정할 배당금 항목을 담는 곳

  // 1. DB에서 배당금 기록 불러오기 (최신순)
  const fetchData = async () => {
    setLoading(true);
    const { data: list, error } = await supabase
      .from("dividends")
      .select("*")
      .order("date", { ascending: false });

    if (!error) setData((list || []) as Dividend[]);
    setLoading(false);
  };

  // 컴포넌트가 처음 화면에 나타날 때 데이터 불러오기
  useEffect(() => { fetchData(); }, []);

  // 2. 삭제 기능
  const handleDelete = async (id: string) => {
    if (!confirm("이 배당 기록을 정말 삭제할까요?")) return;
    
    const { error } = await supabase.from("dividends").delete().eq("id", id);
    
    if (error) {
      toast.error("삭제 중 오류가 발생했습니다.");
    } else {
      toast.success("배당 기록이 삭제되었습니다.");
      fetchData(); // 삭제 후 목록 새로고침
    }
  };

  // 🌟 [수정 모드] 사용자가 '연필' 버튼을 누르면 이 부분이 렌더링됩니다.
  if (editingItem) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between px-2 pb-2 border-b">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-primary">배당 기록 수정</h3>
          </div>
        </div>
        
        {/* DividendForm에 'editing' 프롭을 넘겨서 수정 모드로 작동시킵니다. */}
        <DividendForm 
          editing={editingItem} 
          onSaved={() => {
            setEditingItem(null); // 저장이 완료되면 폼을 닫습니다.
            fetchData(); // 목록을 새로고침합니다.
          }}
          onCancelEdit={() => setEditingItem(null)} // '취소' 버튼을 누르면 폼을 닫습니다.
        />
      </div>
    );
  }

  // 🌟 [일반 모드] 데이터를 불러오는 중일 때
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin mb-2" />
      <p className="text-sm">기록을 불러오는 중입니다...</p>
    </div>
  );

  // 🌟 [일반 모드] 배당금 리스트를 보여줍니다.
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="max-h-[500px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-secondary/90 backdrop-blur-sm z-10 shadow-sm">
            <TableRow>
              <TableHead className="w-[100px] font-semibold">지급일</TableHead>
              <TableHead className="font-semibold">종목명</TableHead>
              <TableHead className="text-right font-semibold">배당금</TableHead>
              <TableHead className="w-[90px] text-center font-semibold">관리</TableHead>
            </TableRow>
          </TableHeader>
          
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground border-dashed">
                  기록된 배당 내역이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/50 transition-colors group">
                  {/* 날짜 */}
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {item.date}
                  </TableCell>
                  
                  {/* 종목명 */}
                  <TableCell className="font-medium text-sm sm:text-base">
                    {item.asset_name}
                  </TableCell>
                  
                  {/* 배당 금액 (통화 기호 표시) */}
                  <TableCell className="text-right">
                    <span className="font-bold tabular-nums">
                      {item.currency === "USD" ? "$" : ""}
                      {item.amount.toLocaleString(undefined, {
                        minimumFractionDigits: item.currency === "USD" ? 2 : 0,
                        maximumFractionDigits: item.currency === "USD" ? 2 : 0
                      })}
                    </span>
                    <span className="text-[10px] ml-1 text-muted-foreground font-medium">
                      {item.currency === "KRW" ? "원" : "USD"}
                    </span>
                  </TableCell>
                  
                  {/* 관리 버튼 (수정 / 삭제) */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setEditingItem(item)} // 🌟 클릭 시 수정 모드로 전환
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        title="수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(item.id)} // 🌟 클릭 시 삭제 확인창 띄움
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};