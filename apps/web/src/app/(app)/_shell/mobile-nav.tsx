'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { Role } from '@/lib/api/types';
import { SidebarNav } from './sidebar-nav';

/** Navigation drawer below the `lg` breakpoint. */
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <SheetHeader>
            <SheetTitle>FleetOps</SheetTitle>
            <SheetDescription className="sr-only">
              Main navigation
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <SidebarNav role={role} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
