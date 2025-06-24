"use client";

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';

export function SearchBarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state to be consistent on server and client to avoid hydration errors.
  // The state will be synced with the URL search query in the useEffect hook.
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const currentSearchQuery = searchParams.get('search');
    setInputValue(currentSearchQuery || '');
    if (currentSearchQuery) {
      setIsExpanded(true);
    }
  }, [searchParams]);

  const handleSearchSubmit = (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const trimmedValue = inputValue.trim();
    if (trimmedValue) {
      router.push(`/?search=${encodeURIComponent(trimmedValue)}`);
    } else {
      router.push('/');
    }
  };
  
  const clearSearchAndCollapse = () => {
    setInputValue('');
    setIsExpanded(false);
    if (searchParams.get('search')) {
        router.push('/');
    }
  };

  const toggleExpansion = () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    
    // If we are collapsing the bar by clicking the search icon, clear any active search
    if (!nextState) {
        clearSearchAndCollapse();
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
    <div className="flex items-center flex-grow gap-1 sm:flex-grow-0 sm:w-auto sm:gap-2">
      <form onSubmit={handleSearchSubmit} className="flex items-center flex-grow gap-1 sm:gap-2">
        <Input
          type="search"
          placeholder="Search..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="h-9 w-full sm:w-40 md:w-56"
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
