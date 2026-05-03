import { useEffect, useMemo, useState } from "react";
import { Combine, Loader2, Pencil, Sparkles, Wand2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { findSimilarAsset, normalizeAsset, similarity } from "@/lib/assetMatch";

const IGNORE_KEY = "asset_merge_ignore_pairs_v2";
const pairKey = (a: string, b: string) => (a < b ? `${a}||${b}` : `${b}||${a}`);
const loadIgnore = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) ?? "[]")); }
  catch { return new Set(); }
};
const saveIgnore = (s: Set<string>) => localStorage.setItem(IGNORE_KEY, JSON.stringify(Array.from(s)));

interface AssetRow {
  name: string;
  dividends: number;
  snapshots: number;
  suggested?: string | null;
}

export const AssetMergeManager = () => {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [merging, setMerging] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameSource, setRenameSource] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [ignorePairs, setIgnorePairs] = useState<Set<string>>(() => loadIgnore());

  const load = async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      supabase.from("dividends").select("asset_name").limit(10000),
      supabase.from("portfolio_snapshots").select("asset_name").limit(10000),
    ]);
    const counts = new Map<string, AssetRow>();
    (a.data ?? []).forEach((r: any) => {
      if (!r.asset_name) return;
      const cur = counts.get(r.asset_name) ?? { name: r.asset_name, dividends: 0, snapshots: 0 };
      cur.dividends += 1;
      counts.set(r.asset_name, cur);
    });
    (b.data ?? []).forEach((r: any) => {
      if (!r.asset_name) return;
      const cur = counts.get(r.asset_name) ?? { name: r.asset_name, dividends: 0, snapshots: 0 };
      cur.snapshots += 1;
      counts.set(r.asset_name, cur);
    });
    const all = Array.from(counts.values());
    const names = all.map((x) => x.name);
    // Compute suggestion (likely canonical) per name from siblings
    all.forEach((row) => {
      const others = names.filter((n) => n !== row.name);
      row.suggested = findSimilarAsset(row.name, others, 0.8);
    });
    setRows(all.sort((x, y) => x.name.localeCompare(y.name, "ko")));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group fragmented variants
  const groups = useMemo(() => {
    const map = new Map<string, AssetRow[]>();
    rows.forEach((r) => {
      const key = normalizeAsset(r.name);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    });
    return Array.from(map.values()).filter((g) => g.length > 1);
  }, [rows]);

  // Smart fuzzy grouping (≥85% similarity), Union-Find across all names, excluding ignored pairs
  const smartGroups = useMemo(() => {
    const arr = rows.map((r) => r);
    const n = arr.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = arr[i].name, b = arr[j].name;
        if (ignorePairs.has(pairKey(a, b))) continue;
        if (similarity(a, b) >= 0.75) union(i, j);
      }
    }
    const map = new Map<number, AssetRow[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const list = map.get(r) ?? [];
      list.push(arr[i]);
      map.set(r, list);
    }
    return Array.from(map.values())
      .filter((g) => g.length > 1)
      .map((g) => g.sort((x, y) => (y.dividends + y.snapshots) - (x.dividends + x.snapshots)));
  }, [rows, ignorePairs]);

  const ignoreGroup = (g: AssetRow[]) => {
    const next = new Set(ignorePairs);
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++)
        next.add(pairKey(g[i].name, g[j].name));
    setIgnorePairs(next);
    saveIgnore(next);
    toast.success("이 조합은 다시 추천되지 않아요");
  };

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelected(next);
  };

  const openMerge = (preselect?: string[]) => {
    if (preselect) setSelected(new Set(preselect));
    if ((preselect ?? Array.from(selected)).length < 2) {
      toast.error("병합할 종목을 2개 이상 선택해주세요");
      return;
    }
    const first = (preselect ?? Array.from(selected))[0];
    setTarget(first);
    setDialogOpen(true);
  };

  const merge = async () => {
    const finalName = target.trim();
    if (!finalName) return toast.error("대표 이름을 입력해주세요");
    const sources = Array.from(selected).filter((n) => n !== finalName);
    if (sources.length === 0) {
      toast.info("변경할 종목이 없어요");
      setDialogOpen(false);
      return;
    }
    setMerging(true);
    try {
      const [d, s] = await Promise.all([
        supabase.from("dividends").update({ asset_name: finalName }).in("asset_name", sources),
        supabase.from("portfolio_snapshots").update({ asset_name: finalName }).in("asset_name", sources),
      ]);
      if (d.error) throw d.error;
      if (s.error) throw s.error;
      toast.success(`${sources.length}개 종목명을 "${finalName}"(으)로 통합했어요`);
      setDialogOpen(false);
      setSelected(new Set());
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "병합 중 오류가 발생했어요");
    } finally {
      setMerging(false);
    }
  };

  const openRename = (name: string) => {
    setRenameSource(name);
    setRenameTo(name);
    setRenameOpen(true);
  };

  const renameAsset = async () => {
    const finalName = renameTo.trim();
    if (!finalName) return toast.error("새 이름을 입력해주세요");
    if (finalName === renameSource) {
      setRenameOpen(false);
      return;
    }
    setMerging(true);
    try {
      const [d, s] = await Promise.all([
        supabase.from("dividends").update({ asset_name: finalName }).eq("asset_name", renameSource),
        supabase.from("portfolio_snapshots").update({ asset_name: finalName }).eq("asset_name", renameSource),
      ]);
      if (d.error) throw d.error;
      if (s.error) throw s.error;
      toast.success(`"${renameSource}" → "${finalName}" 으로 변경되었습니다`);
      setRenameOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "이름 변경 중 오류가 발생했어요");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Card className="p-6 shadow-elev-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Combine className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">종목명 병합</h2>
        </div>
        <Button
          size="sm"
          onClick={() => openMerge()}
          disabled={selected.size < 2}
          className="bg-gradient-primary hover:opacity-90"
        >
          선택한 {selected.size}개 병합하기
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        OCR 오타·띄어쓰기로 분리된 종목을 하나로 합칠 수 있어요. 유사 종목은 자동으로 추천됩니다.
      </p>

      {smartGroups.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Wand2 className="h-4 w-4 text-primary" />
            <span>데이터 정리가 필요해 보입니다 — <b>{smartGroups.length}건</b>의 유사 종목 그룹이 발견되었어요.</span>
          </div>
          <Button size="sm" onClick={() => setSuggestOpen(true)}>추천 보기</Button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">⚠️ 띄어쓰기/대소문자만 다른 그룹</p>
          {groups.map((g, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2">
              {g.map((row) => (
                <Badge key={row.name} variant="outline">{row.name}</Badge>
              ))}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openMerge(g.map((x) => x.name))}>
                <Sparkles className="h-4 w-4 mr-1" /> 한 번에 합치기
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border max-h-[420px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]" />
              <TableHead>종목명</TableHead>
              <TableHead className="text-right w-[80px]">배당</TableHead>
              <TableHead className="text-right w-[80px]">스냅샷</TableHead>
              <TableHead className="w-[200px]">유사 추천</TableHead>
              <TableHead className="text-right w-[100px]">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">불러오는 중…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">등록된 종목이 없어요</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>
                  <Checkbox checked={selected.has(r.name)} onCheckedChange={() => toggle(r.name)} />
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right">{r.dividends}</TableCell>
                <TableCell className="text-right">{r.snapshots}</TableCell>
                <TableCell>
                  {r.suggested ? (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => openMerge([r.name, r.suggested!])}
                    >
                      ⚠️ "{r.suggested}"와 합치기
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openRename(r.name)}>
                    <Pencil className="h-4 w-4 mr-1" /> 이름 변경
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>어떤 이름으로 통일하시겠습니까?</DialogTitle>
            <DialogDescription>
              선택한 {selected.size}개 종목을 아래 대표 이름으로 일괄 변경합니다. (배당 내역 & 스냅샷 모두 적용)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>선택한 종목</Label>
              <div className="flex flex-wrap gap-1">
                {Array.from(selected).map((s) => (
                  <Badge key={s} variant="secondary">{s}</Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>대표 이름</Label>
              <div className="flex flex-wrap gap-1 mb-1">
                {Array.from(selected).map((s) => (
                  <Button key={s} type="button" size="sm" variant={target === s ? "default" : "outline"} onClick={() => setTarget(s)}>
                    {s}
                  </Button>
                ))}
              </div>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="직접 입력 또는 위에서 선택" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={merging}>취소</Button>
            <Button onClick={merge} disabled={merging || !target.trim()}>
              {merging && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}병합 실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>종목명 변경</DialogTitle>
            <DialogDescription>
              "{renameSource}" 의 모든 기록(배당 & 스냅샷)을 새 이름으로 일괄 변경합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>새 이름</Label>
            <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} placeholder="새 종목명" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={merging}>취소</Button>
            <Button onClick={renameAsset} disabled={merging || !renameTo.trim()}>
              {merging && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}변경
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>유사 종목 병합 추천</DialogTitle>
            <DialogDescription>
              이름이 85% 이상 유사한 종목 그룹입니다. 대표 이름은 사용 빈도가 가장 높은 이름을 추천했어요.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto space-y-3">
            {smartGroups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">추천할 그룹이 없습니다 🎉</p>
            )}
            {smartGroups.map((g, i) => (
              <SuggestionGroupCard
                key={i}
                group={g}
                onIgnore={() => ignoreGroup(g)}
                onMerge={(picked, rep) => {
                  setSuggestOpen(false);
                  setSelected(new Set(picked));
                  setTarget(rep);
                  setDialogOpen(true);
                }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
