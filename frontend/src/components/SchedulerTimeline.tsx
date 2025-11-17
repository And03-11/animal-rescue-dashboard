// --- Archivo: frontend/src/components/SchedulerTimeline.tsx (VERSIÓN FINAL v3) ---
import React, { useEffect, useRef } from 'react';
import { Timeline, type TimelineOptions } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import type { DataItem, DataGroup } from 'vis-timeline'; 
import 'vis-timeline/styles/vis-timeline-graph2d.css'; 
import { Box } from '@mui/material';

// --- Interfaces (Ampliadas para incluir tus datos) ---
export interface TimelineItem extends DataItem {
  id: string | number; 
  content: string; 
  start: Date; 
  group: string | number; 
  className?: string;
  style?: string;
  type?: 'point' | 'background' | 'box' | 'range' | undefined;
  campaign_id?: number; 
  title?: string; // Para el tooltip
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

// --- Props de Callback (Aceptan Promises) ---
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
  
  // --- Inicialización (se ejecuta 1 vez) ---
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
        zoomMin: 1000 * 60 * 60 * 24, // 1 día
        zoomMax: 1000 * 60 * 60 * 24 * 31 * 6, // ~6 meses
        
        // 1. Desactivar el "snap" (para que no salte al soltar)
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
        
        // ✅ 2. ELIMINAMOS LA PLANTILLA 'template'
        // 'point' items no la usan. Usaremos el 'title' (tooltip) en su lugar.
      };

      // Crear la instancia
      const timeline = new Timeline(
        timelineRef.current,
        itemsDataSetRef.current, 
        groupsDataSetRef.current, 
        options
      );

      // 3. Mejorar el listener de Doble Clic
      if (onItemDoubleClick) {
        timeline.on('doubleClick', (props) => {
          // Si tiene 'item', es un ítem (envío o fondo de campaña)
          if (props.item) {
            onItemDoubleClick(props.item);
          } 
          // Si tiene 'group', es un clic en la etiqueta del grupo (fila)
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

  // --- Sincronización de Datos (usando .clear() y .add()) ---
  useEffect(() => {
    itemsDataSetRef.current.clear();
    itemsDataSetRef.current.add(items);
  }, [items]);

  useEffect(() => {
    groupsDataSetRef.current.clear();
    groupsDataSetRef.current.add(groups);
  }, [groups]);

  // Renderiza el contenedor
  return <Box ref={timelineRef} sx={{ width: '100%' }} />;
};