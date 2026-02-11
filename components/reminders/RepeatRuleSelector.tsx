
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
import { CalendarIcon } from "lucide-react";
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
    const [open, setOpen] = React.useState(false);

    const getPresetValue = () => {
        if (!value) return "none";
        if (value.frequency === 'hourly' && value.interval === 1) return "hourly";
        if (value.frequency === 'daily' && value.interval === 1) return "daily";
        if (value.frequency === 'weekly' && value.interval === 1 && (!value.weekdays || value.weekdays.length === 0)) return "weekly";
        if (value.frequency === 'monthly' && value.interval === 1) return "monthly";
        if (value.frequency === 'weekly' && value.weekdays?.length === 5 && !value.weekdays.includes(0) && !value.weekdays.includes(6)) return "weekdays";
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
            setOpen(true);
            if (!value) {
                onChange({ frequency: 'daily', interval: 1 });
            }
        }
    };

    const updateRule = (updates: Partial<RepeatRule>) => {
        if (!value) return;
        onChange({ ...value, ...updates });
    };

    const toggleWeekday = (day: number) => {
        if (!value) return;
        const currentDays = value.weekdays || [];
        const newDays = currentDays.includes(day)
            ? currentDays.filter(d => d !== day)
            : [...currentDays, day].sort();

        onChange({
            ...value,
            frequency: 'custom',
            weekdays: newDays
        });
    };

    const getFrequencyLabel = (freq: string, interval: number) => {
        const plural = interval > 1;
        switch (freq) {
            case 'hourly': return plural ? 'hours' : 'hour';
            case 'daily': return plural ? 'days' : 'day';
            case 'weekly': return plural ? 'weeks' : 'week';
            case 'monthly': return plural ? 'months' : 'month';
            default: return plural ? 'days' : 'day';
        }
    };

    return (
        <div className="space-y-2">
            <Label>Repeat</Label>
            <div className="flex gap-2">
                <Select value={getPresetValue()} onValueChange={handlePresetChange}>
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

                {getPresetValue() === "custom" && (
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon">
                                <CalendarIcon className="w-4 h-4" />
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
                                        value={value?.frequency === 'custom' ? 'daily' : (value?.frequency || 'daily')}
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

                            {(value?.frequency === 'weekly' || value?.frequency === 'custom') && (
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
                        </PopoverContent>
                    </Popover>
                )}
            </div>
            {value && (
                <div className="text-xs text-muted-foreground mt-1">
                    Repeats every {value.interval > 1 ? `${value.interval} ` : ""}{getFrequencyLabel(value.frequency, value.interval)}
                    {value.weekdays?.length ? ` on ${value.weekdays.length} days` : ""}
                    {value.endCondition?.type === 'date' && value.endCondition.untilDate ? ` until ${format(value.endCondition.untilDate.toDate(), 'PP')}` : ""}
                    {value.endCondition?.type === 'count' ? ` for ${value.endCondition.count} times` : ""}
                </div>
            )}
        </div>
    );
}
