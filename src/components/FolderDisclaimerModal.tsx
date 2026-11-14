import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pathBaseName } from "@/lib/utils";

interface FolderDisclaimerModalProps {
  folderPath: string;
  onAcknowledge: () => void;
  onCancel: () => void;
}

/** Consent before the agent works in a folder: names the action, the data and the risk. */
export const FolderDisclaimerModal: React.FC<FolderDisclaimerModalProps> = ({
  folderPath,
  onAcknowledge,
  onCancel,
}) => {
  const folderName = pathBaseName(folderPath);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Let Vibework work in “{folderName}”?</DialogTitle>
          <DialogDescription>
            It can read, change and permanently delete anything in this folder and its subfolders, and
            what it reads is sent to the agent or model you choose.
          </DialogDescription>
        </DialogHeader>
        <p className="-mt-2 truncate font-mono text-meta text-muted-foreground" title={folderPath}>
          {folderPath}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onAcknowledge}>Allow access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
