import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { z } from "zod";
import { TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

// Internal-only domain used to back ID-based auth on top of Supabase email auth.
const ID_DOMAIN = "id.local";
const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${ID_DOMAIN}`;

const usernameSchema = z
  .string()
  .trim()
  .min(3, "아이디는 3자 이상이어야 합니다")
  .max(30, "아이디는 30자 이하여야 합니다")
  .regex(/^[a-zA-Z0-9_.-]+$/, "영문, 숫자, _ . - 만 사용할 수 있습니다");

const passwordSchema = z
  .string()
  .min(6, "비밀번호는 6자 이상이어야 합니다")
  .max(72, "비밀번호는 72자 이하여야 합니다");

const Auth = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    document.title = "로그인 · Dividend Tracker";
  }, []);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (mode: "signin" | "signup") => {
    const u = usernameSchema.safeParse(username);
    if (!u.success) {
      toast.error(u.error.errors[0].message);
      return;
    }
    const p = passwordSchema.safeParse(password);
    if (!p.success) {
      toast.error(p.error.errors[0].message);
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다");
      return;
    }

    const email = usernameToEmail(u.data);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const name = displayName.trim() || u.data;
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password: p.data,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { username: u.data, full_name: name, display_name: name },
          },
        });
        if (error) throw error;
        // Best-effort: update profiles.display_name (trigger creates the row)
        const uid = signUpData.user?.id;
        if (uid) {
          await supabase.from("profiles").update({ display_name: name }).eq("id", uid);
        }
        toast.success("가입 완료! 대시보드로 이동합니다.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: p.data,
        });
        if (error) throw error;
        toast.success("환영합니다 👋");
      }
      navigate("/");
    } catch (err: any) {
      toast.error(err.message ?? "오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center mb-8 gap-2">
          <div className="h-11 w-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-elev-lg">
            <TrendingUp className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Dividend Tracker</h1>
        </div>

        <Card className="p-6 shadow-elev-md border-border/60">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">로그인</TabsTrigger>
              <TabsTrigger value="signup">회원가입</TabsTrigger>
            </TabsList>

            {(["signin", "signup"] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`username-${mode}`}>아이디</Label>
                  <Input
                    id={`username-${mode}`}
                    type="text"
                    placeholder="예: dividend_king"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`password-${mode}`}>비밀번호</Label>
                  <Input
                    id={`password-${mode}`}
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </div>
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="display-name">이름</Label>
                    <Input
                      id="display-name"
                      type="text"
                      placeholder="예: 홍길동"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={50}
                    />
                  </div>
                )}
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">비밀번호 확인</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={passwordsMismatch}
                    />
                    {passwordsMismatch && (
                      <p className="text-sm text-destructive">비밀번호가 일치하지 않습니다</p>
                    )}
                  </div>
                )}
                <Button
                  onClick={() => handleSubmit(mode)}
                  disabled={
                    submitting ||
                    (mode === "signup" && (passwordsMismatch || confirmPassword.length === 0))
                  }
                  className="w-full bg-gradient-primary hover:opacity-90 transition-opacity h-11 text-base font-semibold shadow-elev-md"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "로그인" : "가입하기"}
                </Button>
              </TabsContent>
            ))}
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          배당 내역을 안전하게 기록하고 분석하세요
        </p>
      </div>
    </main>
  );
};

export default Auth;
