import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCw } from "lucide-react";

interface ErrorCardProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorCard({ message = "Failed to load data.", onRetry }: ErrorCardProps) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex items-center gap-4 py-6">
        <AlertCircle className="size-5 text-destructive shrink-0" />
        <p className="text-sm text-muted-foreground flex-1">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw className="size-4" />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
