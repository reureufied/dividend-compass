import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, Calendar, Settings, TrendingUp, 
  LogOut, BarChart3, Wallet, FileText, Plus 
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// 분석 부품 임포트
import { PortfolioUploadCard } from "@/components/PortfolioUploadCard";
import { DividendUploadCard } from "@/components/DividendUploadCard";

const navItems = [
  { to: "/", label: "대시보드", icon: LayoutDashboard, end: true },
  { to: "/analysis", label: "분석", icon: BarChart3 },
  { to: "", label: "기록", icon: Plus, highlight: true },
  { to: "/calendar", label: "캘린더", icon: Calendar },
  { to: "/settings", label: "마이페이지", icon: Settings },
];

export const AppLayout = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [isDividendOpen, setIsDividendOpen] = useState(false);
  const [fxRate, setFxRate] = useState(1350);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* --- 상단 헤더: max-w-5xl (약 1024px)로 안정감 있게 조정 --- */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl overflow-hidden flex items-center justify-center">
              <img 
                src="/logo.ico"
                alt="Dividend Compass Logo" 
                className="h-full w-full object-contain" // 이미지가 잘리지 않게 비율 유지
              />
            </div>
            <span className="font-bold text-lg tracking-tight">Portfolio Lab</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-2" />
            로그아웃
          </Button>
        </div>
      </header>

      {/* --- 메인 컨텐츠: 헤더와 동일하게 max-w-5xl 적용 --- */}
      <main className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
        <Outlet />
      </main>

      {/* --- 하단 네비게이션: 중앙 정렬 유지 --- */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-lg">
        <div className="flex h-16 items-center justify-around px-2 max-w-md mx-auto w-full">
          {navItems.map((item) => {
            if (item.highlight) {
              return (
                <Popover key="add-popup">
                  <PopoverTrigger asChild>
                    <button className="flex flex-col items-center justify-center p-2 text-muted-foreground hover:text-primary transition-colors outline-none group">
                      <div className="bg-primary text-primary-foreground rounded-full p-3 -mt-5 shadow-elev-md transition-transform group-active:scale-95 group-hover:scale-105">
                        <item.icon className="h-6 w-6" />
                      </div>
                      <span className="text-[10px] font-medium mt-1">{item.label}</span>
                    </button>
                  </PopoverTrigger>
                  
                  <PopoverContent side="top" align="center" className="w-56 p-2 mb-2 rounded-2xl shadow-2xl border-border/60 bg-background/95 backdrop-blur-md" sideOffset={10}>
                    <div className="flex flex-col gap-1">
                      <Dialog open={isPortfolioOpen} onOpenChange={setIsPortfolioOpen}>
                        <button 
                          onClick={() => setIsPortfolioOpen(true)}
                          className="flex w-full items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left outline-none"
                        >
                          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                            <Wallet className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-semibold">자산 현황 기록</span>
                        </button>
                        <DialogContent className="sm:max-w-[500px] w-[95vw] rounded-2xl p-6 border-none shadow-2xl">
                          <DialogHeader className="mb-4">
                            <DialogTitle className="text-xl font-bold text-center">자산 현황 스캔</DialogTitle>
                          </DialogHeader>
                          <PortfolioUploadCard onSaved={() => setIsPortfolioOpen(false)} />
                        </DialogContent>
                      </Dialog>

                      <Dialog open={isDividendOpen} onOpenChange={setIsDividendOpen}>
                        <button 
                          onClick={() => setIsDividendOpen(true)}
                          className="flex w-full items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left outline-none"
                        >
                          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                            <FileText className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-semibold">배당금 내역 기록</span>
                        </button>
                        <DialogContent className="sm:max-w-[600px] w-[95vw] rounded-2xl p-6 border-none shadow-2xl">
                          <DialogHeader className="mb-4">
                            <DialogTitle className="text-xl font-bold text-center">배당금 내역 분석</DialogTitle>
                          </DialogHeader>
                          <DividendUploadCard 
                            fxRate={fxRate} 
                            onSaved={() => setIsDividendOpen(false)} 
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }

            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center p-2 transition-colors outline-none",
                    isActive ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-5 w-5 mb-1" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};