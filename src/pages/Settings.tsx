import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { z } from "zod";
import { 
  Download, LogOut, Mail, Target, Loader2, Trash2, 
  History, ReceiptText, BarChart 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Dividend } from "@/lib/dividends";
import { useDisplayName } from "@/hooks/useDisplayName";
import { Pencil, Check, X, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// 하부 관리 부품들 임포트
import { AssetMergeManager } from "@/components/AssetMergeManager";
import { AssetHistoryManager } from "@/components/AssetHistoryManager";
import { DividendHistoryManager } from "@/components/DividendHistoryManager";



const goalSchema = z.object({
  monthly_goal: z.number().min(0, "0 이상 입력해주세요").max(1_000_000_000_000),
  yearly_goal: z.number().min(0, "0 이상 입력해주세요").max(1_000_000_000_000),
});

const Settings = () => {
  const { user, signOut } = useAuth();
  const displayName = useDisplayName();
  const navigate = useNavigate();
  const { toast: uiToast } = useToast(); // @/hooks/use-toast

  // --- 개인정보 수정 관련 상태 추가 ---
  const [isVerifying, setIsVerifying] = useState(false); // 비번 확인 단계
  const [isEditing, setIsEditing] = useState(false);     // 수정 폼 단계
  const [currentPassword, setCurrentPassword] = useState("");
  const [editData, setEditData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [confirmPassword, setConfirmPassword] = useState(""); // ⬅️ 추가된 상태
  const [isUpdating, setIsUpdating] = useState(false);
 
  const [monthly, setMonthly] = useState("");
  const [yearly, setYearly] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
      if (user) {
        setEditData(prev => ({
          ...prev,
          name: user.user_metadata?.full_name || displayName || "",
          email: user.email || ""
        }));
      }
    }, [user, displayName]);

    // 1. 비밀번호 확인 로직
    const handleVerifyPassword = async () => {
      if (!currentPassword) {
        toast.error("비밀번호를 입력해주세요.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (error) {
        toast.error("비밀번호가 일치하지 않습니다.");
        return;
      }

      setIsVerifying(false);
      setIsEditing(true);
      setCurrentPassword("");
      toast.success("본인 확인 완료! 정보를 수정할 수 있습니다.");
    };

    // 2. 정보 업데이트 로직 (검증 추가)
      const handleUpdateProfile = async () => {
        // 🔽 비밀번호 일치 여부 검증 로직 추가
        if (editData.password && editData.password !== confirmPassword) {
          toast.error("새 비밀번호가 일치하지 않습니다. 다시 확인해주세요.");
          return;
        }

        setIsUpdating(true);
        try {
          const updatePayload: any = {
            email: editData.email,
            data: { full_name: editData.name }
          };
          
          // 비밀번호를 입력했을 때만 페이로드에 추가
          if (editData.password) updatePayload.password = editData.password;

          const { error } = await supabase.auth.updateUser(updatePayload);

          if (error) throw error;

          toast.success("개인정보가 수정되었습니다. ✨");
          setIsEditing(false);
          setEditData(prev => ({ ...prev, password: "" }));
          setConfirmPassword(""); // 초기화
        } catch (error: any) {
          toast.error(error.message);
        } finally {
          setIsUpdating(false);
        }
      };

  // 목표 데이터 불러오기
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("monthly_goal, yearly_goal")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMonthly(String(Number(data?.monthly_goal ?? 0)));
        setYearly(String(Number(data?.yearly_goal ?? 0)));
        setLoading(false);
      });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = goalSchema.safeParse({
      monthly_goal: parseFloat(monthly) || 0,
      yearly_goal: parseFloat(yearly) || 0,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("목표가 저장되었습니다! 🎯");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="space-y-8 w-full animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">마이페이지</h1>
        <p className="text-muted-foreground mt-1">목표 설정, 기록 관리, 데이터 백업을 한곳에서</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 수정된 계정 정보 카드 */}
        <Card className="p-6 shadow-elev-sm border-none bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <h2 className="font-semibold text-foreground">계정 정보</h2>
            </div>
            
            {/* 연필 버튼: 수정/확인 중이 아닐 때만 표시 */}
            {!isEditing && !isVerifying && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={() => setIsVerifying(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* 상황별 렌더링 */}
          {isVerifying ? (
            <div className="space-y-3 animate-in slide-in-from-right-2 duration-300">
              <div className="flex items-center gap-2 text-sm text-amber-600 font-medium">
                <Lock className="h-4 w-4" /> 비밀번호 확인이 필요합니다
              </div>
              <div className="flex gap-2">
                <Input 
                  type="password" 
                  placeholder="현재 비밀번호 입력" 
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                />
                <Button onClick={handleVerifyPassword}>확인</Button>
                <Button variant="ghost" size="icon" onClick={() => setIsVerifying(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : isEditing ? (
            <div className="space-y-4 animate-in zoom-in-95 duration-300">
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">이름</Label>
                  <Input 
                    value={editData.name} 
                    onChange={(e) => setEditData({...editData, name: e.target.value})} 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">이메일</Label>
                  <Input 
                    value={editData.email} 
                    onChange={(e) => setEditData({...editData, email: e.target.value})} 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">새 비밀번호 </Label>
                  <Input 
                    type="password" 
                    placeholder="새 비밀번호"
                    value={editData.password} 
                    onChange={(e) => setEditData({...editData, password: e.target.value})} 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">새 비밀번호 확인</Label>
                  <Input 
                    type="password" 
                    placeholder="새 비밀번호 확인"
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleUpdateProfile} disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-2" />} 저장
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>취소</Button>
              </div>
            </div>
          ) : (
            /* 기본 정적 표시 모드 */
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">이름</p>
                <p className="font-medium truncate">{displayName || "-"}</p>
                <p className="text-xs text-muted-foreground mt-2">아이디(이메일)</p>
                <p className="font-medium truncate text-sm text-muted-foreground">
                  {user?.email}
                </p>
              </div>
              <Button variant="outline" onClick={handleSignOut} className="shrink-0">
                <LogOut className="h-4 w-4 mr-2" /> 로그아웃
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-6 shadow-elev-sm border-none bg-card/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <Target className="h-4 w-4" />
            <h2 className="font-semibold text-foreground">배당 목표 설정</h2>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="monthly">월 목표 (원)</Label>
                <Input id="monthly" type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearly">연 목표 (원)</Label>
                <Input id="yearly" type="number" value={yearly} onChange={(e) => setYearly(e.target.value)} disabled={loading} />
              </div>
            </div>
            <Button type="submit" disabled={saving || loading} className="w-full bg-gradient-primary">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} 저장하기
            </Button>
          </form>
        </Card>
      </div>

      {/* 2. 핵심: 내 기록 관리 (필터, 정렬, 일괄 수정 기능 포함) */}
      <Card className="p-6 shadow-elev-sm border-none bg-card">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <History className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-bold">내 기록 관리</h2>
        </div>
        
        <Tabs defaultValue="assets" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 bg-secondary/50 p-1 h-12 max-w-md mx-auto sm:mx-0">
            {/* 자산 현황이 왼쪽(기본) */}
            <TabsTrigger value="assets" className="flex items-center gap-2">
              <BarChart className="h-4 w-4" /> 자산 현황
            </TabsTrigger>
            {/* 배당금 기록이 오른쪽 */}
            <TabsTrigger value="dividends" className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4" /> 배당금 기록
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assets" className="mt-0">
            <AssetHistoryManager />
          </TabsContent>

          <TabsContent value="dividends" className="mt-0">
            <DividendHistoryManager />
          </TabsContent>
        </Tabs>
      </Card>

      {/* 3. 기타 도구들 */}
      <AssetMergeManager />

      <Card className="p-6 shadow-elev-sm border-none bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
          <Download className="h-4 w-4" />
          <h2 className="font-semibold text-foreground">데이터 백업</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">입력한 배당 내역을 CSV 파일로 안전하게 저장하세요.</p>
        <Button variant="outline" className="w-full sm:w-auto">내보내기</Button>
      </Card>

      <div className="pt-8 flex justify-center">
        <button onClick={() => setDeleteOpen(true)} className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-4">
          서비스 탈퇴
        </button>
      </div>

      {/* 탈퇴 확인 다이얼로그 (내용 생략 - 기존 유지) */}
    </div>
  );
};

export default Settings;