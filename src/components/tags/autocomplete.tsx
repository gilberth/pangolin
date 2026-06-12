import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { TagInputStyleClassesProps, type Tag as TagType } from "./tag-input";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "../ui/command";
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
    PopoverTrigger
} from "../ui/popover";
import { Button } from "../ui/button";
import { cn } from "@app/lib/cn";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

type AutocompleteProps = {
    tags: TagType[];
    setTags: React.Dispatch<React.SetStateAction<TagType[]>>;
    setInputValue: React.Dispatch<React.SetStateAction<string>>;
    setTagCount: React.Dispatch<React.SetStateAction<number>>;
    autocompleteOptions: TagType[];
    maxTags?: number;
    onTagAdd?: (tag: string) => void;
    onTagRemove?: (tag: string) => void;
    allowDuplicates: boolean;
    children: React.ReactNode;
    inlineTags?: boolean;
    classStyleProps: TagInputStyleClassesProps["autoComplete"];
    usePortal?: boolean;
    /** Narrows the dropdown list from the main field (cmdk search filters further). */
    filterQuery?: string;
};

export const Autocomplete: React.FC<AutocompleteProps> = ({
    tags,
    setTags,
    setInputValue,
    setTagCount,
    autocompleteOptions,
    maxTags,
    onTagAdd,
    onTagRemove,
    allowDuplicates,
    inlineTags,
    children,
    classStyleProps,
    usePortal,
    filterQuery = ""
}) => {
    const triggerContainerRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const popoverContentRef = useRef<HTMLDivElement | null>(null);
    const t = useTranslations();

    const [popoverWidth, setPopoverWidth] = useState<number>(0);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [inputFocused, setInputFocused] = useState(false);
    const [commandResetKey, setCommandResetKey] = useState(0);

    const visibleOptions = useMemo(() => {
        const q = filterQuery.trim().toLowerCase();
        if (!q) return autocompleteOptions;
        return autocompleteOptions.filter((option) =>
            option.text.toLowerCase().includes(q)
        );
    }, [autocompleteOptions, filterQuery]);

    useEffect(() => {
        if (isPopoverOpen) {
            setCommandResetKey((k) => k + 1);
        }
    }, [isPopoverOpen]);

    // Close the popover when clicking outside of it
    useEffect(() => {
        const handleOutsideClick = (
            event: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent
        ) => {
            if (
                isPopoverOpen &&
                triggerContainerRef.current &&
                popoverContentRef.current &&
                !triggerContainerRef.current.contains(event.target as Node) &&
                !popoverContentRef.current.contains(event.target as Node)
            ) {
                setIsPopoverOpen(false);
            }
        };

        document.addEventListener("mousedown", handleOutsideClick);

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, [isPopoverOpen]);

    const handleOpenChange = useCallback(
        (open: boolean) => {
            if (open && triggerContainerRef.current) {
                const { width } =
                    triggerContainerRef.current.getBoundingClientRect();
                setPopoverWidth(width);
            }

            if (open) {
                inputRef.current?.focus();
                setIsPopoverOpen(open);
            }
        },
        [inputFocused]
    );

    const handleInputFocus = (
        event:
            | React.FocusEvent<HTMLInputElement>
            | React.FocusEvent<HTMLTextAreaElement>
    ) => {
        if (triggerContainerRef.current) {
            const { width } =
                triggerContainerRef.current.getBoundingClientRect();
            setPopoverWidth(width);
            setIsPopoverOpen(true);
        }

        // Only set inputFocused to true if the popover is already open.
        // This will prevent the popover from opening due to an input focus if it was initially closed.
        if (isPopoverOpen) {
            setInputFocused(true);
        }

        const userOnFocus = (children as React.ReactElement<any>).props.onFocus;
        if (userOnFocus) userOnFocus(event);
    };

    const handleInputBlur = (
        event:
            | React.FocusEvent<HTMLInputElement>
            | React.FocusEvent<HTMLTextAreaElement>
    ) => {
        setInputFocused(false);

        // Allow the popover to close if no other interactions keep it open
        if (!isPopoverOpen) {
            setIsPopoverOpen(false);
        }

        const userOnBlur = (children as React.ReactElement<any>).props.onBlur;
        if (userOnBlur) userOnBlur(event);
    };

    const toggleTag = (option: TagType) => {
        // Check if the tag already exists in the array
        const index = tags.findIndex((tag) => tag.text === option.text);

        if (index >= 0) {
            // Tag exists, remove it
            const newTags = tags.filter((_, i) => i !== index);
            setTags(newTags);
            setTagCount((prevCount) => prevCount - 1);
            if (onTagRemove) {
                onTagRemove(option.text);
            }
        } else {
            // Tag doesn't exist, add it if allowed
            if (
                !allowDuplicates &&
                tags.some((tag) => tag.text === option.text)
            ) {
                // If duplicates aren't allowed and a tag with the same text exists, do nothing
                return;
            }

            // Add the tag if it doesn't exceed max tags, if applicable
            if (!maxTags || tags.length < maxTags) {
                setTags([...tags, option]);
                setTagCount((prevCount) => prevCount + 1);
                setInputValue("");
                if (onTagAdd) {
                    onTagAdd(option.text);
                }
            }
        }
    };

    const child = children as React.ReactElement<
        React.InputHTMLAttributes<HTMLInputElement> & {
            ref?: React.Ref<HTMLInputElement>;
        }
    >;
    const userOnKeyDown = child.props.onKeyDown;

    const childrenWithProps = React.cloneElement(child, {
        onKeyDown: userOnKeyDown,
        onFocus: handleInputFocus,
        onBlur: handleInputBlur,
        ref: inputRef
    } as Partial<
        React.InputHTMLAttributes<HTMLInputElement> & {
            ref?: React.Ref<HTMLInputElement>;
        }
    >);

    return (
        <div
            className={cn(
                "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
                classStyleProps?.command
            )}
        >
            <Popover
                open={isPopoverOpen}
                onOpenChange={handleOpenChange}
                modal={usePortal}
            >
                <PopoverAnchor asChild>
                    <div
                        className="relative h-full flex items-center rounded-md border border-input bg-transparent pr-1"
                        ref={triggerContainerRef}
                    >
                        {childrenWithProps}
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                role="combobox"
                                className={cn(
                                    `hover:bg-transparent ${!inlineTags ? "ml-auto" : ""}`,
                                    classStyleProps?.popoverTrigger
                                )}
                                onClick={() => {
                                    setIsPopoverOpen(!isPopoverOpen);
                                }}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={`lucide lucide-chevron-down h-4 w-4 shrink-0 opacity-50 ${isPopoverOpen ? "rotate-180" : "rotate-0"}`}
                                >
                                    <path d="m6 9 6 6 6-6"></path>
                                </svg>
                            </Button>
                        </PopoverTrigger>
                    </div>
                </PopoverAnchor>
                <PopoverContent
                    ref={popoverContentRef}
                    side="bottom"
                    align="start"
                    forceMount
                    className={cn("p-0", classStyleProps?.popoverContent)}
                    style={{
                        width: `${popoverWidth}px`,
                        minWidth: `${popoverWidth}px`,
                        zIndex: 9999
                    }}
                >
                    <Command
                        key={commandResetKey}
                        className={cn(
                            "rounded-lg border-0 shadow-none",
                            classStyleProps?.command
                        )}
                    >
                        <CommandInput
                            placeholder={t("searchPlaceholder")}
                            className="h-9"
                        />
                        <CommandList
                            className={cn(
                                "max-h-[300px]",
                                classStyleProps?.commandList
                            )}
                        >
                            <CommandEmpty>{t("noResults")}</CommandEmpty>
                            <CommandGroup
                                className={classStyleProps?.commandGroup}
                            >
                                {visibleOptions.map((option) => {
                                    const isChosen = tags.some(
                                        (tag) => tag.text === option.text
                                    );
                                    return (
                                        <CommandItem
                                            key={option.id}
                                            value={`${option.text} ${option.id}`}
                                            onSelect={() => toggleTag(option)}
                                            className={
                                                classStyleProps?.commandItem
                                            }
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4 shrink-0",
                                                    isChosen
                                                        ? "opacity-100"
                                                        : "opacity-0"
                                                )}
                                            />
                                            {option.text}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};
