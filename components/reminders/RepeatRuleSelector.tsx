
"use client";

import * as React from "react";
import { RepeatRule } from "@/lib/types";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CalendarIcon, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";

interface RepeatRuleSelectorProps {
    value?: RepeatRule;
    onChange: (rule: RepeatRule | undefined) => void;
}

const WEEKDAYS = [
    { label: "S", value: 0 },
    { label: "M", value: 1 },
    { label: "T", value: 2 },
    { label: "W", value: 3 },
    { label: "T", value: 4 },
    { label: "F", value: 5 },
    { label: "S", value: 6 },
];

export function RepeatRuleSelector({ value, onChange }: RepeatRuleSelectorProps) {
    const [customOpen, setCustomOpen] = React.useState(false);

    // Determine if current value matches a preset, or is custom
    const getPresetValue = (): string => {
        if (!value) return "none";
        const { frequency, interval, weekdays, skipWeekends } = value;

        if (frequency === 'hourly' && interval === 1) return "hourly";
        if (frequency === 'daily' && interval === 1) return "daily";
        if (frequency === 'weekly' && interval === 1 && (!weekdays || weekdays.length === 0)) return "weekly";
        if (frequency === 'monthly' && interval === 1) return "monthly";

        // Weekdays preset: weekly, interval 1, exactly Mon-Fri
        if (
            frequency === 'weekly' &&
            interval === 1 &&
            weekdays?.length === 5 &&
            [1, 2, 3, 4, 5].every(d => weekdays.includes(d))
        ) {
            return "weekdays";
        }

        // Anything else is custom
        return "custom";
    };

    const handlePresetChange = (preset: string) => {
        if (preset === "none") {
            onChange(undefined);
            return;
        }
        if (preset === "hourly") {
            onChange({ frequency: 'hourly', interval: 1 });
        } else if (preset === "daily") {
            onChange({ frequency: 'daily', interval: 1 });
        } else if (preset === "weekly") {
            onChange({ frequency: 'weekly', interval: 1 });
        } else if (preset === "monthly") {
            onChange({ frequency: 'monthly', interval: 1 });
        } else if (preset === "weekdays") {
            onChange({ frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], skipWeekends: true });
        } else if (preset === "custom") {
            // Open the custom editor. Keep the existing rule if it exists,
            // otherwise start with a sensible default that WON'T match any preset.
            setCustomOpen(true);
            if (!value) {
                onChange({ frequency: 'daily', interval: 2 });
            }
        }
    };

    const updateRule = (updates: Partial<RepeatRule>) => {
        const current = value || { frequency: 'daily' as const, interval: 1 };
        onChange({ ...current, ...updates });
    };

    const toggleWeekday = (day: number) => {
        const current = value || { frequency: 'weekly' as const, interval: 1 };
        const currentDays = current.weekdays || [];
        const newDays = currentDays.includes(day)
            ? currentDays.filter(d => d !== day)
            : [...currentDays, day].sort();

        // Use 'weekly' frequency with specific weekdays — NOT 'custom'
        onChange({
            ...current,
            frequency: 'weekly',
            weekdays: newDays,
        });
    };

    // Get the underlying frequency for the custom panel select.
    // If frequency is 'custom', map it to the appropriate underlying type.
    const getCustomFrequency = (): string => {
        if (!value) return 'daily';
        if (value.frequency === 'custom') {
            // If it has weekdays, treat as weekly
            if (value.weekdays && value.weekdays.length > 0) return 'weekly';
            return 'daily';
        }
        return value.frequency;
    };

    const getFrequencyLabel = (freq: string, interval: number) => {
        const plural = interval > 1;
        switch (freq) {
            case 'hourly': return plural ? 'hours' : 'hour';
            case 'daily': return plural ? 'days' : 'day';
            case 'weekly': return plural ? 'weeks' : 'week';
            case 'monthly': return plural ? 'months' : 'month';
            case 'custom': return plural ? 'days' : 'day';
            default: return plural ? 'days' : 'day';
        }
    };

    const presetValue = getPresetValue();

    return (
        <div className="space-y-2">
            <Label>Repeat</Label>
            <div className="flex gap-2">
                <Select value={presetValue} onValueChange={handlePresetChange}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Does not repeat" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Does not repeat</SelectItem>
                        <SelectItem value="hourly">Every Hour</SelectItem>
                        <SelectItem value="daily">Every Day</SelectItem>
                        <SelectItem value="weekly">Every Week</SelectItem>
                        <SelectItem value="monthly">Every Month</SelectItem>
                        <SelectItem value="weekdays">Every Weekday (Mon-Fri)</SelectItem>
                        <SelectItem value="custom">Custom...</SelectItem>
                    </SelectContent>
                </Select>

                {presetValue === "custom" && (
                    <Popover open={customOpen} onOpenChange={setCustomOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" title="Edit custom repeat">
                                <Settings2 className="w-4 h-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-4 space-y-4" align="end">
                            <h4 className="font-semibold leading-none mb-2">Custom Repeat</h4>

                            <div className="space-y-2">
                                <Label>Frequency</Label>
                                <div className="flex gap-2 items-center">
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">Every</span>
                                    <Input
                                        type="number"
                                        min={1}
                                        className="w-16"
                                        value={value?.interval || 1}
                                        onChange={(e) => updateRule({ interval: parseInt(e.target.value) || 1 })}
                                    />
                                    <Select
                                        value={getCustomFrequency()}
                                        onValueChange={(val: any) => updateRule({ frequency: val })}
                                    >
                                        <SelectTrigger className="w-28">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="hourly">Hour(s)</SelectItem>
                                            <SelectItem value="daily">Day(s)</SelectItem>
                                            <SelectItem value="weekly">Week(s)</SelectItem>
                                            <SelectItem value="monthly">Month(s)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {(getCustomFrequency() === 'weekly') && (
                                <div className="space-y-2">
                                    <Label>On these days</Label>
                                    <div className="flex justify-between">
                                        {WEEKDAYS.map((day) => (
                                            <div
                                                key={day.value}
                                                className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center text-xs cursor-pointer border transition-colors",
                                                    value?.weekdays?.includes(day.value)
                                                        ? "bg-primary text-primary-foreground border-primary"
                                                        : "bg-background hover:bg-muted border-input"
                                                )}
                                                onClick={() => toggleWeekday(day.value)}
                                            >
                                                {day.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>End Condition</Label>
                                <Select
                                    value={value?.endCondition?.type || 'never'}
                                    onValueChange={(val: any) => updateRule({ endCondition: { type: val } })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="never">Never</SelectItem>
                                        <SelectItem value="date">On Date</SelectItem>
                                        <SelectItem value="count">After occurrences</SelectItem>
                                    </SelectContent>
                                </Select>

                                {value?.endCondition?.type === 'date' && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {value.endCondition.untilDate
                                                    ? format(value.endCondition.untilDate.toDate(), "PPP")
                                                    : "Pick a date"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={value.endCondition.untilDate?.toDate()}
                                                onSelect={(date) => date && updateRule({
                                                    endCondition: { ...value.endCondition!, untilDate: Timestamp.fromDate(date) }
                                                })}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                )}

                                {value?.endCondition?.type === 'count' && (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={value.endCondition.count || 1}
                                            onChange={(e) => updateRule({
                                                endCondition: { ...value.endCondition!, count: parseInt(e.target.value) || 1 }
                                            })}
                                        />
                                        <span className="text-sm text-muted-foreground">times</span>
                                    </div>
                                )}
                            </div>

                            <Button
                                variant="default"
                                className="w-full"
                                size="sm"
                                onClick={() => setCustomOpen(false)}
                            >
                                Done
                            </Button>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
            {value && (
                <div className="text-xs text-muted-foreground mt-1">
                    Repeats every {value.interval > 1 ? `${value.interval} ` : ""}{getFrequencyLabel(value.frequency, value.interval)}
                    {value.weekdays?.length ? ` on ${value.weekdays.map(d => WEEKDAYS[d].label).join(', ')}` : ""}
                    {value.endCondition?.type === 'date' && value.endCondition.untilDate ? ` until ${format(value.endCondition.untilDate.toDate(), 'PP')}` : ""}
                    {value.endCondition?.type === 'count' ? ` for ${value.endCondition.count} times` : ""}
                </div>
            )}
        </div>
    );
}
