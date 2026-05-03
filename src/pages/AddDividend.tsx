import { useEffect } from "react";
import { Card } from "@/components/ui/card";

const AddDividend = () => {
  useEffect(() => {
    document.title = "내역 입력 · Dividend Tracker";
  }, []);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">배당금 입력</h1>
      <Card className="p-6 shadow-elev-sm">
        <p className="text-muted-foreground">곧 입력 폼과 히스토리 테이블이 추가됩니다.</p>
      </Card>
    </div>
  );
};

export default AddDividend;
