import { useEffect } from "react";
import { Card } from "@/components/ui/card";

const Settings = () => {
  useEffect(() => {
    document.title = "마이페이지 · Dividend Tracker";
  }, []);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">마이페이지</h1>
      <Card className="p-6 shadow-elev-sm">
        <p className="text-muted-foreground">목표 설정 및 데이터 내보내기 기능이 추가될 예정입니다.</p>
      </Card>
    </div>
  );
};

export default Settings;
