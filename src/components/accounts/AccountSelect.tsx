"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { IrctcAccount } from "@/types/account"

interface AccountSelectProps {
  accounts: IrctcAccount[]
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  disabled,
  placeholder = "Select account...",
  className
}: AccountSelectProps) {
  const [open, setOpen] = React.useState(false)

  // Sort accounts by username ascending
  const sortedAccounts = React.useMemo(() => {
    return [...accounts].sort((a, b) => a.username.localeCompare(b.username))
  }, [accounts])

  const selectedAccount = sortedAccounts.find((account) => account.username === value)

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          {value
            ? selectedAccount?.username || value
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] min-w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search account..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {sortedAccounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={account.username}
                  onSelect={() => {
                    onChange(account.username)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === account.username ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {account.username}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
