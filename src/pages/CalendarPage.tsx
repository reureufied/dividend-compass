import { useEffect } from "react";
import { Card } from "@/components/ui/card";

const CalendarPage = () => {
  useEffect(() => {
    document.title = "캘린더 · Dividend Tracker";
  }, []);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">배당 캘린더</h1>
      <Card className="p-6 shadow-elev-sm">
        <p className="text-muted-foreground">월간 캘린더가 이곳에 표시됩니다.</p>
      </Card>
    </div>
  );
};

export default CalendarPage;
