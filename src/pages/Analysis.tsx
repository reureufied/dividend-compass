import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        <p className="text-muted-foreground mt-1">배당, 포트폴리오, 수익률을 한 곳에서 살펴보세요.</p>
      </header>

      <Tabs defaultValue="dividend" className="space-y-6">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="dividend">배당금 분석</TabsTrigger>
          <TabsTrigger value="portfolio">포트폴리오 분석</TabsTrigger>
          <TabsTrigger value="yield">수익률 분석</TabsTrigger>
        </TabsList>
        <TabsContent value="dividend"><DividendAnalysis /></TabsContent>
        <TabsContent value="portfolio"><PortfolioAnalysis /></TabsContent>
        <TabsContent value="yield"><YieldAnalysis /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Analysis;
