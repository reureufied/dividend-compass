import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Wallet, Target, TrendingUp, PieChart } from "lucide-react";

const quickRanges = ["1개월", "3개월", "6개월", "올해", "전체"];

const Index = () => {
  useEffect(() => {
    document.title = "대시보드 · Dividend Tracker";
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">대시보드</h1>
          <p className="text-muted-foreground mt-1">배당 흐름을 한눈에 확인하세요</p>
        </div>
      </header>

      {/* Date filter bar */}
      <Card className="p-4 shadow-elev-sm">
        <div className="flex flex-wrap gap-2">
          {quickRanges.map((r, i) => (
            <Button
              key={r}
              variant={i === 3 ? "default" : "secondary"}
              size="sm"
              className={i === 3 ? "bg-gradient-primary" : ""}
            >
              {r}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="ml-auto">
            기간 직접 선택
          </Button>
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6 shadow-elev-sm hover:shadow-elev-md transition-smooth">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">총 누적 배당금</span>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold">₩0</div>
          <p className="text-xs text-success mt-2">선택된 기간 기준</p>
        </Card>

        <Card className="p-6 shadow-elev-sm hover:shadow-elev-md transition-smooth">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">목표 달성률</span>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold">0%</div>
          <Progress value={0} className="mt-3" />
        </Card>

        <Card className="p-6 shadow-elev-sm hover:shadow-elev-md transition-smooth sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">기록 건수</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold">0건</div>
          <p className="text-xs text-muted-foreground mt-2">첫 배당을 입력해보세요</p>
        </Card>
      </div>

      {/* Charts placeholders */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 shadow-elev-sm">
          <h3 className="font-semibold mb-1">월별 배당 추이</h3>
          <p className="text-xs text-muted-foreground mb-4">막대 차트 (예정)</p>
          <div className="h-64 rounded-xl bg-gradient-subtle border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
            데이터를 입력하면 차트가 표시됩니다
          </div>
        </Card>

        <Card className="p-6 shadow-elev-sm">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold">시장 비중</h3>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mb-4">도넛 차트 (예정)</p>
          <div className="h-64 rounded-xl bg-gradient-subtle border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
            카테고리별 분석
          </div>
        </Card>
      </div>

      <Card className="p-6 shadow-elev-sm">
        <h3 className="font-semibold mb-4">효자 종목 Top 5</h3>
        <p className="text-sm text-muted-foreground">아직 기록된 종목이 없습니다.</p>
      </Card>
    </div>
  );
};

export default Index;
