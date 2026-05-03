import { useEffect } from "react";
import { AssetMergeManager } from "@/components/AssetMergeManager";

const AssetManager = () => {
  useEffect(() => {
    document.title = "종목 관리 · Dividend Tracker";
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">종목 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          DB 전체에 등록된 종목명을 한곳에서 검토하고, 오타·띄어쓰기로 분리된 종목을 통합하거나 이름을 바꿀 수 있어요.
        </p>
      </div>
      <AssetMergeManager />
    </div>
  );
};

export default AssetManager;
