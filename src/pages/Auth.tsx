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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Internal-only domains used to back ID-based auth on top of email auth.
// Keep the legacy domain so accounts created before the ID-login update can still sign in.
const ID_DOMAINS = ["local.compass", "id.local"] as const;
const usernameToEmail = (email: string) => email.trim().toLowerCase();
const usernameToLoginEmails = (email: string) => [usernameToEmail(email)];

const usernameSchema = z
  .string()
  .trim()
  .min(1, "이메일을 입력해주세요")
  .email("유효한 이메일 주소 형식이 아닙니다");

const passwordSchema = z
  .string()
  .min(6, "비밀번호는 최소 6자 이상이어야 합니다")
  .max(72, "비밀번호는 72자 이하여야 합니다");

type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
};

const translateAuthError = (err: unknown, mode: "signin" | "signup"): string => {
  const authErr = (err ?? {}) as AuthErrorLike;
  const code = String(authErr.code ?? "").toLowerCase();
  const msg = String(authErr.message ?? "").toLowerCase();
  const status = authErr.status;

  if (mode === "signup") {
    if (code === "user_already_exists" || msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already")) {
      return "이미 가입된 아이디입니다. 로그인해 주세요.";
    }
    if (msg.includes("password should be at least") || msg.includes("password is too short")) {
      return "비밀번호는 최소 6자 이상이어야 합니다.";
    }
    if (code === "weak_password" || msg.includes("pwned") || msg.includes("compromised") || msg.includes("leaked")) {
      return "보안에 취약하거나 유출 이력이 있는 비밀번호입니다. 다른 비밀번호를 사용해 주세요.";
    }
    if (msg.includes("rate limit") || status === 429) {
      return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    }
  }

  if (mode === "signin") {
    if (code === "invalid_credentials" || msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
      return "아이디 또는 비밀번호가 일치하지 않습니다.";
    }
    if (code === "user_not_found" || msg.includes("user not found")) {
      return "가입되지 않은 아이디입니다.";
    }
    if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
      return "이메일 인증이 완료되지 않았습니다.";
    }
  }

  return authErr.message ?? "오류가 발생했습니다";
};

type DialogState = {
  open: boolean;
  title: string;
  description: string;
  onClose?: () => void;
};

const Auth = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ open: false, title: "", description: "" });

  const showDialog = (title: string, description: string, onClose?: () => void) => {
    setDialog({ open: true, title, description, onClose });
  };

  useEffect(() => {
    document.title = "로그인 · Portfolio Lab";
  }, []);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (mode: "signin" | "signup") => {
    const u = usernameSchema.safeParse(username);
    if (!u.success) {
      showDialog("아이디 확인", u.error.errors[0].message);
      return;
    }
    const p = passwordSchema.safeParse(password);
    if (!p.success) {
      showDialog("비밀번호 확인", p.error.errors[0].message);
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      showDialog("비밀번호 확인", "비밀번호가 일치하지 않습니다.");
      return;
    }

    const email = usernameToEmail(u.data);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const name = displayName.trim() || u.data;
        const { error } = await supabase.auth.signUp({
          email,
          password: p.data,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { username: u.data, full_name: name, display_name: name },
          },
        });
        if (error) throw error;
        // profiles 행은 on_auth_user_created 트리거(handle_new_user)가 자동 생성합니다.
        showDialog("가입 완료", "회원가입이 완료되었습니다. 대시보드로 이동합니다.", () => navigate("/"));
      } else {
        let lastError: AuthErrorLike | null = null;
        for (const loginEmail of usernameToLoginEmails(u.data)) {
          const { error } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password: p.data,
          });
          if (!error) {
            lastError = null;
            break;
          }
          lastError = error;
        }
        if (lastError) throw lastError;
        navigate("/");
      }
    } catch (err: unknown) {
      const title = mode === "signup" ? "회원가입 실패" : "로그인 실패";
      showDialog(title, translateAuthError(err, mode));
    } finally {
      setSubmitting(false);
    }
  };

  return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex items-center justify-center mb-8 gap-3">
            {/* 로고 이미지 컨테이너 */}
            <div className="h-12 w-12 rounded-xl overflow-hidden flex items-center justify-center">
              <img 
                src="/logo.ico" // 👈 여기에 저장해두신 실제 경로를 입력하세요! (예: /logo.png 또는 /src/assets/logo.png)
                alt="Dividend Compass Logo"
                className="h-full w-full object-cover"
              />
            </div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Lab</h1>
        </div>

        <Card className="p-6 shadow-elev-md border-border/60">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">로그인</TabsTrigger>
              <TabsTrigger value="signup">회원가입</TabsTrigger>
            </TabsList>

            {(["signin", "signup"] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="display-name">이름</Label>
                    <Input
                      id="display-name"
                      type="text"
                      placeholder="예: 이르르"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={50}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor={`username-${mode}`}>아이디</Label>
                  <Input
                    id={`username-${mode}`}
                    type="text"
                    placeholder="예: reureufied@gmail.com"
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
                  {mode === "signup" && (
                    <p className="text-xs text-muted-foreground">최소 6자 이상 입력해 주세요.</p>
                  )}
                </div>
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

      <AlertDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) {
            const cb = dialog.onClose;
            setDialog((d) => ({ ...d, open: false }));
            cb?.();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const cb = dialog.onClose;
                setDialog((d) => ({ ...d, open: false }));
                cb?.();
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default Auth;
