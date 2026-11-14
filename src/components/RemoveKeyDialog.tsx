import React, { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useProviderKey } from "@/hooks/useProviderKey";
import { errorMessage } from "@/lib/utils";

interface RemoveKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirms removing the OpenRouter key; on success the app returns to key entry. */
export const RemoveKeyDialog: React.FC<RemoveKeyDialogProps> = ({ open, onOpenChange }) => {
  const { disconnect } = useProviderKey();
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await disconnect();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the key."));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isRemoving && onOpenChange(next)}>
      <DialogContent hideClose className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Remove your OpenRouter key?</DialogTitle>
          <DialogDescription>
            It’s deleted from the system keychain, and you’ll need to paste a key to keep working.
            Your conversations stay on this computer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isRemoving}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
            {isRemoving && <Spinner className="size-4" />}
            Remove key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
