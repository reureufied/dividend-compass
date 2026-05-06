import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; // 🌟 에러의 원인! 이 부분이 추가되었습니다.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Trash2, Pencil, Loader2, ChevronDown, ChevronUp, 
  Wallet, TrendingUp, CircleDollarSign, Target, ArrowUpDown 
} from "lucide-react";
import { EditHoldingDialog } from "./EditHoldingDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Checkbox } from "@/components/ui/checkbox"; // 임포트 확인!

export const AssetHistoryManager = () => {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHolding, setEditingHolding] = useState<any | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // 필터 및 정렬 상태
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");

  // 일괄 날짜 수정 상태
  const [dateEditOpen, setDateEditOpen] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [newDate, setNewDate] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false });

    if (!error) setSnapshots(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // 필터 및 정렬이 적용된 날짜 그룹 계산
  const filteredAndSortedDates = useMemo(() => {
    const groups: Record<string, any[]> = snapshots.reduce((acc: any, cur) => {
      const date = cur.snapshot_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(cur);
      return acc;
    }, {});

    let dateEntries = Object.entries(groups);

    if (startDate) dateEntries = dateEntries.filter(([date]) => date >= startDate);
    if (endDate) dateEntries = dateEntries.filter(([date]) => date <= endDate);

    dateEntries.sort((a, b) => {
      const [dateA, itemsA] = a;
      const [dateB, itemsB] = b;
      const firstCreatedA = itemsA[0].created_at;
      const firstCreatedB = itemsB[0].created_at;

      switch (sortBy) {
        case "date_asc": return dateA.localeCompare(dateB);
        case "entry_desc": return firstCreatedB.localeCompare(firstCreatedA);
        case "entry_asc": return firstCreatedA.localeCompare(firstCreatedB);
        default: return dateB.localeCompare(dateA);
      }
    });

    return dateEntries;
  }, [snapshots, startDate, endDate, sortBy]);


  // 컴포넌트 내부
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 전체 선택/해제 로직
  const onHeaderCheckboxChange = (checked: boolean, allIds: string[]) => {
    if (checked) {
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  // 개별 선택/해제 로직
  const onRowCheckboxChange = (checked: boolean, id: string) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  // 날짜 일괄 변경 실행
  const handleBulkDateUpdate = async () => {
    if (!newDate) return toast.error("새 날짜를 선택해주세요.");
    
    const { error } = await supabase
      .from("portfolio_snapshots")
      .update({ snapshot_date: newDate })
      .eq("snapshot_date", targetDate);

    if (error) {
      toast.error("날짜 수정에 실패했습니다.");
    } else {
      toast.success(`${targetDate} 기록이 ${newDate}로 일괄 변경되었습니다.`);
      setDateEditOpen(false);
      fetchData(); // 🌟 변경 후 데이터 리프레시
    }
  };

  // 단일 종목 삭제
  const handleDeleteRow = async (id: string) => {
    if (!confirm("이 종목 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("portfolio_snapshots").delete().eq("id", id);
    if (!error) {
      toast.success("삭제되었습니다.");
      fetchData();
    }
  };

  const formatPrice = (value: number, currency: string = "KRW") => {
    if (currency === "USD") return `$${value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `${Math.round(value || 0).toLocaleString()}원`;
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* 🌟 4. 필터 & 5. 정렬 컨트롤 바 */}
      <div className="flex flex-col md:flex-row gap-4 items-end justify-between p-4 bg-secondary/30 rounded-2xl border border-border/50">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 shrink-0">
            <Label className="w-fit whitespace-nowrap px-2 py-2 text-[11px] font-bold ml-1 text-muted-foreground">시작일</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 bg-background shadow-none" />
          </div>
          <span className="mb-2 text-muted-foreground hidden sm:inline">~</span>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="w-fit whitespace-nowrap px-2 py-2 text-[11px] font-bold ml-1 text-muted-foreground">종료일</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 bg-background shadow-none" />
          </div>
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => {setStartDate(""); setEndDate("");}} className="h-9 mt-5 text-xs">
              초기화
            </Button>
          )}
        </div>

        <div className="space-y-1.5 w-full md:w-56">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 bg-background shadow-none">
              <ArrowUpDown className="h-3.5 w-3.5 mr-2 opacity-70" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">날짜 최신순 (기본)</SelectItem>
              <SelectItem value="date_asc">날짜 오래된순</SelectItem>
              <SelectItem value="entry_desc">데이터 입력 최신순</SelectItem>
              <SelectItem value="entry_asc">데이터 입력 오래된순</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 🌟 3. 스크롤 가능한 단일 카드 (날짜 리스트) */}
      <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
        <div className="max-h-[600px] overflow-y-auto divide-y divide-border scrollbar-hide">
          {filteredAndSortedDates.length === 0 ? (
            <div className="p-24 text-center text-muted-foreground">조건에 맞는 자산 기록이 없습니다.</div>
          ) : (
            filteredAndSortedDates.map(([date, items]) => (
              <div key={date} className="group/date relative">
                
                {/* 날짜 헤더 (클릭 시 펼침/접힘) */}
                <div 
                  className={cn(
                    "sticky top-0 z-10 p-4 bg-card/95 backdrop-blur-md flex items-center justify-between cursor-pointer border-b transition-colors",
                    expandedDate === date ? "bg-primary/5" : "hover:bg-secondary/20"
                  )}
                  onClick={() => setExpandedDate(expandedDate === date ? null : date)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-base sm:text-lg tabular-nums tracking-tight">{date}</span>
                    
                    {/* 🌟 2. 날짜 일괄 수정 버튼 (연필 아이콘) */}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-full bg-primary/10 text-primary opacity-0 group-hover/date:opacity-100 transition-all hover:bg-primary hover:text-primary-foreground"
                      onClick={(e) => {
                        e.stopPropagation(); // 클릭 시 아코디언이 열리는 것을 방지
                        setTargetDate(date);
                        setNewDate(date);
                        setDateEditOpen(true);
                      }}
                      title="이 날짜 일괄 수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full">
                      {items.length}개 종목
                    </span>
                    {expandedDate === date ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </div>

                {/* 해당 날짜의 종목 리스트 */}
                {expandedDate === date && (
                  <div className="p-3 space-y-2 bg-muted/10">
                    {items.map((h) => (
                      <div key={h.id} className="p-4 rounded-xl border bg-background flex items-start sm:items-center justify-between gap-4 group hover:border-primary/30 transition-colors">
                        <div className="flex-1 min-w-0 space-y-2.5">
                          <h4 className="font-bold text-sm text-foreground truncate">{h.asset_name}</h4>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge icon={<Wallet />} label="수량" value={h.quantity?.toLocaleString()} color="bg-blue-500/10 text-blue-600" />
                            <Badge icon={<CircleDollarSign />} label="매수" value={formatPrice(h.avg_purchase_price, h.currency)} color="bg-amber-500/10 text-amber-600" />
                            <Badge icon={<TrendingUp />} label="현재" value={formatPrice(h.current_price, h.currency)} color="bg-emerald-500/10 text-emerald-600" />
                            <Badge icon={<Target />} label="비중" value={`${h.target_weight}%`} color="bg-purple-500/10 text-purple-600" />
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingHolding(h)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteRow(h.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 🌟 날짜 일괄 수정을 위한 다이얼로그 모달 */}
      <Dialog open={dateEditOpen} onOpenChange={setDateEditOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">기록 날짜 일괄 변경</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground bg-secondary px-2 py-0.5 rounded">{targetDate}</span> 의 모든 종목 기록을 새로운 날짜로 이동합니다.
            </p>
            <div className="space-y-2">
              <Label>새로운 날짜</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-12 text-lg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateEditOpen(false)}>취소</Button>
            <Button onClick={handleBulkDateUpdate} className="bg-primary text-primary-foreground">변경 적용</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 단일 종목 수정을 위한 모달 (기존 기능) */}
      <EditHoldingDialog 
        open={!!editingHolding} 
        onOpenChange={(open) => !open && setEditingHolding(null)}
        holding={editingHolding}
        onSaved={fetchData}
      />
    </div>
  );
};



// 미니 뱃지 UI 컴포넌트
const Badge = ({ icon, label, value, color }: any) => (
  <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-transparent", color)}>
    <span className="opacity-70">{icon}</span>
    <span className="opacity-60 hidden sm:inline">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);