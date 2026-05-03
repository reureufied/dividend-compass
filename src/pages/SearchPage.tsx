import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search as SearchIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORIES, Dividend } from "@/lib/dividends";
import { krwOf } from "@/lib/analytics";
import { formatKRW, formatUSD } from "@/lib/fx";

const ALL = "__all__";

const SearchPage = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Dividend[]>([]);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [currency, setCurrency] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    document.title = "상세 검색 · Dividend Tracker";
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("dividends")
      .select("*")
      .order("date", { ascending: false })
      .then(({ data }) => setItems((data ?? []) as Dividend[]));
  }, [user]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((d) => {
      if (kw && !d.asset_name.toLowerCase().includes(kw)) return false;
      if (category !== ALL && d.category !== category) return false;
      if (currency !== ALL && d.currency !== currency) return false;
      if (from && d.date < from) return false;
      if (to && d.date > to) return false;
      return true;
    });
  }, [items, keyword, category, currency, from, to]);

  const total = useMemo(() => filtered.reduce((s, d) => s + krwOf(d), 0), [filtered]);

  const reset = () => {
    setKeyword("");
    setCategory(ALL);
    setCurrency(ALL);
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">상세 검색</h1>
        <p className="text-muted-foreground mt-1">조건에 맞는 배당 내역만 골라서 분석해보세요</p>
      </header>

      <Card className="p-5 shadow-elev-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="kw">종목명 검색</Label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="kw"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: SCHD"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>시장 분류</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>전체</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>통화</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>전체</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="KRW">KRW</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="from">시작일</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">종료일</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={reset}>
            <X className="h-4 w-4 mr-1" />
            필터 초기화
          </Button>
        </div>
      </Card>

      <Card className="p-5 shadow-elev-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">검색 결과 합계</p>
            <p className="text-2xl font-bold tabular-nums">{formatKRW(total)}</p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {filtered.length}건
          </Badge>
        </div>
      </Card>

      <Card className="shadow-elev-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            조건에 맞는 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>종목</TableHead>
                  <TableHead>분류</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">원화 환산</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SearchPage;
