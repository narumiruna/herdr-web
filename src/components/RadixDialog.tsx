import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Theme } from "@radix-ui/themes";
import type { ReactNode, RefObject } from "react";

interface RadixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onCloseAutoFocus?: () => void;
}

export function RadixDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
  initialFocusRef,
  onCloseAutoFocus,
}: RadixDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Theme asChild hasBackground={false}>
          <Dialog.Content
            className={`dialog-content ${className}`}
            onOpenAutoFocus={(event) => {
              if (!initialFocusRef?.current) return;
              event.preventDefault();
              initialFocusRef.current.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (!onCloseAutoFocus) return;
              event.preventDefault();
              onCloseAutoFocus();
            }}
          >
            <div className="dialog-heading">
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description>{description}</Dialog.Description>
              </div>
              <Dialog.Close
                className="bare-icon dialog-close"
                aria-label="Close dialog"
              >
                <Cross2Icon />
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Content>
        </Theme>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
