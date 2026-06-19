
import { useState, useRef } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

// The props interface remains unchanged for drop-in compatibility.
interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  onSpecialKey?: (key: string) => boolean;
}

export default function SearchBar({
  onSearch,
  isLoading = false,
  onSpecialKey,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
    inputRef.current?.blur(); // Blur input on submit
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    // Continue to trigger search on every change
    onSearch(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Pass key events up to the parent if the handler exists
    if (onSpecialKey && onSpecialKey(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="group relative w-full">
      {/* Search Icon (positioned inside the input area) */}
      <MagnifyingGlassIcon
        className="
          pointer-events-none
          absolute
          left-4 top-1/2
          h-5 w-5
          -translate-y-1/2
          text-gray-400
          transition-colors
          group-focus-within:text-blue-500
        "
      />

      {/* Main Input Field */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Search for ABS references..."
        autoComplete="off"
        className="input-field w-full rounded-full py-3 pl-11 pr-14"
      />

      {/* Submit Button & Loader (positioned inside the input area) */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary flex h-9 w-9 items-center justify-center rounded-full"
        >
          {isLoading ? (
            <svg
              className="h-5 w-5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <MagnifyingGlassIcon className="h-5 w-5" />
          )}
        </button>
      </div>
    </form>
  );
}