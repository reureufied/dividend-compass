import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AnalysisOverview from "@/components/analysis/AnalysisOverview";
import DividendAnalysis from "./analysis/DividendAnalysis";
import PortfolioAnalysis from "./analysis/PortfolioAnalysis";
import YieldAnalysis from "./analysis/YieldAnalysis";

const Analysis = () => {
  useEffect(() => {
    document.title = "분석 · Dividend Tracker";
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">분석</h1>
        <p className="text-muted-foreground mt-1">한눈에 보는 자산 현황과 세부 지표를 살펴보세요.</p>
      </header>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="dividend">배당금 상세</TabsTrigger>
          <TabsTrigger value="portfolio">포트폴리오 상세</TabsTrigger>
          <TabsTrigger value="yield">수익률 상세</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><AnalysisOverview /></TabsContent>
        <TabsContent value="dividend"><DividendAnalysis /></TabsContent>
        <TabsContent value="portfolio"><PortfolioAnalysis /></TabsContent>
        <TabsContent value="yield"><YieldAnalysis /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Analysis;
