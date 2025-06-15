
"use client";

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';

export function SearchBarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearchQuery = searchParams.get('search');

  const [isExpanded, setIsExpanded] = useState(!!currentSearchQuery);
  const [inputValue, setInputValue] = useState(currentSearchQuery || '');

  useEffect(() => {
    setInputValue(currentSearchQuery || '');
    if (currentSearchQuery) {
      setIsExpanded(true);
    }
    // We don't want to collapse if currentSearchQuery becomes null
    // due to other navigation, only on explicit user action.
  }, [currentSearchQuery]);

  const handleSearchSubmit = (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const trimmedValue = inputValue.trim();
    if (trimmedValue) {
      router.push(`/?search=${encodeURIComponent(trimmedValue)}`);
    } else {
      router.push('/');
      // setIsExpanded(false); // Optional: collapse on empty search submit
    }
  };

  const toggleExpansion = () => {
    const nextIsExpanded = !isExpanded;
    setIsExpanded(nextIsExpanded);

    if (!nextIsExpanded && currentSearchQuery) {
      // If collapsing and a search query was active, clear it
      router.push('/');
      setInputValue('');
    } else if (nextIsExpanded && currentSearchQuery) {
      // If expanding and there's a query, ensure input is populated
      setInputValue(currentSearchQuery);
    }
  };
  
  const clearSearchAndCollapse = () => {
    setInputValue('');
    setIsExpanded(false);
    if (currentSearchQuery) {
        router.push('/');
    }
  };


  if (!isExpanded) {
    return (
      <Button variant="ghost" size="icon" onClick={toggleExpansion} aria-label="Open search bar">
        <Search className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-1 sm:gap-2">
        <Input
          type="search"
          placeholder="Search..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="h-9 w-32 sm:w-40 md:w-56"
          autoFocus
        />
        <Button type="submit" variant="ghost" size="icon" aria-label="Submit search">
          <Search className="h-5 w-5" />
        </Button>
      </form>
      <Button variant="ghost" size="icon" onClick={clearSearchAndCollapse} aria-label="Clear search and close bar">
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}
