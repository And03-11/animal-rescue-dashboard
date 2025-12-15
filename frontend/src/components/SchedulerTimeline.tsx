
import React, { useEffect, useRef } from 'react';
import { Timeline, type TimelineOptions } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import type { DataItem, DataGroup } from 'vis-timeline';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import { Box } from '@mui/material';

// Interfaces
export interface TimelineItem extends DataItem {
  id: string | number;
  content: string;
  start: Date;
  group: string | number;
  className?: string;
  style?: string;
  type?: 'point' | 'background' | 'box' | 'range' | undefined;
  campaign_id?: number;
  title?: string; // For tooltip
}

export interface TimelineGroup extends DataGroup {
  id: string | number;
  content: string;
  notes?: string;
  category?: string;
  segmentation_mode?: string;
  start?: Date;
  end?: Date;
}

// Callback Props
interface SchedulerTimelineProps {
  items: TimelineItem[];
  groups: TimelineGroup[];
  onItemMove?: (
    item: TimelineItem,
    callback: (item: TimelineItem | null) => void
  ) => void | Promise<void>;
  onItemDoubleClick?: (itemId: string | number) => void | Promise<void>;
}

export const SchedulerTimeline: React.FC<SchedulerTimelineProps> = ({
  items,
  groups,
  onItemMove,
  onItemDoubleClick,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineInstanceRef = useRef<Timeline | null>(null);
  const itemsDataSetRef = useRef(new DataSet<TimelineItem>(items));
  const groupsDataSetRef = useRef(new DataSet<TimelineGroup>(groups));

  // Initialization
  useEffect(() => {
    if (timelineRef.current && !timelineInstanceRef.current) {

      const options: TimelineOptions = {
        width: '100%',
        height: '75vh',
        stack: true,
        stackSubgroups: true,
        margin: {
          item: { horizontal: 4, vertical: 8 },
        },
        orientation: 'top',
        zoomMin: 1000 * 60 * 60 * 24, // 1 day
        zoomMax: 1000 * 60 * 60 * 24 * 31 * 6, // ~6 months

        // Disable snap
        snap: null,

        editable: {
          add: false,
          updateTime: true,
          updateGroup: true,
          remove: false,
          overrideItems: false,
        },

        onMove: (item, callback) => {
          if (onItemMove) {
            onItemMove(item as TimelineItem, callback);
          } else {
            callback(item);
          }
        },

      };

      // Create timeline instance
      const timeline = new Timeline(
        timelineRef.current,
        itemsDataSetRef.current,
        groupsDataSetRef.current,
        options
      );

      // Double Click Listener
      if (onItemDoubleClick) {
        timeline.on('doubleClick', (props) => {
          // If item, it is an item (send or campaign background)
          if (props.item) {
            onItemDoubleClick(props.item);
          }
          // If group, it is a click on the group label
          else if (props.group) {
            onItemDoubleClick(props.group);
          }
        });
      }

      timelineInstanceRef.current = timeline;
    }

    // Limpieza al desmontar
    return () => {
      timelineInstanceRef.current?.destroy();
      timelineInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data Synchronization
  useEffect(() => {
    itemsDataSetRef.current.clear();
    itemsDataSetRef.current.add(items);
  }, [items]);

  useEffect(() => {
    groupsDataSetRef.current.clear();
    groupsDataSetRef.current.add(groups);
  }, [groups]);

  // Render container
  return <Box ref={timelineRef} sx={{ width: '100%' }} />;
};
