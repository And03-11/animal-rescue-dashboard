// frontend/src/components/FormTitleSelector.tsx
import React, { useState, useEffect } from 'react';
import {
  TextField,
  Autocomplete,
  Checkbox,
  Chip,
  InputAdornment,
  Skeleton,
  Box,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import FilterListIcon from '@mui/icons-material/FilterList';
import DoneAllIcon from '@mui/icons-material/DoneAll';

interface ApiListItem { id: string; name: string; }

const ALL_KEY = 'ALL';
const allOption: ApiListItem = { id: ALL_KEY, name: '(All Form Titles)' };

interface FormTitleSelectorProps {
  titles: ApiListItem[];
  onSelectionChange: (selectedIds: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  hideInputLabel?: boolean;
  label?: string;
  placeholder?: string;
  size?: 'small' | 'medium';
  compactSelection?: boolean;
  showLeadingIcon?: boolean;
  sx?: SxProps<Theme>;
}

export const FormTitleSelector: React.FC<FormTitleSelectorProps> = ({
  titles,
  onSelectionChange,
  isLoading = false,
  disabled = false,
  hideInputLabel = false,
  label = 'Filter by Form Title(s)',
  placeholder,
  size = 'medium',
  compactSelection = false,
  showLeadingIcon = true,
  sx,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<ApiListItem[]>([allOption]);

  useEffect(() => {
    if (!isLoading) {
      setSelectedOptions([allOption]);
    }
  }, [titles, isLoading]);

  useEffect(() => {
    if (disabled) {
      onSelectionChange([]);
      return;
    }

    if (selectedOptions.some(opt => opt.id === ALL_KEY)) {
      onSelectionChange(titles.map(t => t.id));
    } else {
      onSelectionChange(selectedOptions.map(opt => opt.id));
    }
  }, [disabled, selectedOptions, titles, onSelectionChange]);

  const handleChange = (_e: React.SyntheticEvent, newValue: ApiListItem[]) => {
    if (newValue.length === 0) {
      setSelectedOptions([allOption]);
      return;
    }
    const isSelectingAll = newValue.some(o => o.id === ALL_KEY);
    const wasAllSelected = selectedOptions.some(o => o.id === ALL_KEY);

    if (isSelectingAll && !wasAllSelected) {
      setSelectedOptions([allOption]);
    } else if (isSelectingAll && wasAllSelected) {
      setSelectedOptions(newValue.filter(o => o.id !== ALL_KEY));
    } else if (!isSelectingAll && wasAllSelected) {
      setSelectedOptions(newValue.filter(o => o.id !== ALL_KEY));
    } else {
      setSelectedOptions(newValue);
    }
  };

  const allTitlesWithOptions = [allOption, ...titles];

  if (isLoading) {
    return <Skeleton variant="rectangular" animation="wave" height={48} sx={{ borderRadius: '12px' }} />;
  }

  return (
    <Autocomplete
      multiple
      options={disabled ? [] : allTitlesWithOptions}
      value={disabled ? [] : selectedOptions}
      onChange={handleChange}
      disabled={disabled}
      size={size}
      sx={sx}
      disableCloseOnSelect
      disableClearable={selectedOptions.some(option => option.id === ALL_KEY)}
      noOptionsText="No form titles found"
      getOptionLabel={(option) => option?.name ?? ''}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      renderOption={(props, option, { selected }) => (
        <li {...props}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              pb: option.id === ALL_KEY ? 0.5 : 0,
              mb: option.id === ALL_KEY ? 0.5 : 0,
              borderBottom: option.id === ALL_KEY ? '1px solid rgba(0,0,0,0.12)' : 'none', // why: separador visual para ALL
            }}
          >
            <Checkbox
              icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
              checkedIcon={<CheckBoxIcon fontSize="small" />}
              sx={{ mr: 1 }}
              checked={selected}
            />
            {option.name}
          </Box>
        </li>
      )}
      renderTags={(value, getTagProps) => {
        if (compactSelection && value.length > 0) {
          const allSelected = value.some(option => option.id === ALL_KEY);

          if (allSelected) {
            return (
              <Typography
                variant="body2"
                color="text.primary"
                noWrap
                sx={{ minWidth: 0, maxWidth: '100%', fontWeight: 500 }}
              >
                All form titles
              </Typography>
            );
          }

          return (
            <Chip
              label={`${value.length} selected`}
              size="small"
              variant="outlined"
              icon={<DoneAllIcon />}
              sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
            />
          );
        }

        return value.map((option, index) => {
          const { key: chipKey, ...chipProps } = getTagProps({ index }); // why: 'key' es prop especial; se desestructura
          return (
            <Chip
              key={chipKey}
              label={option.name}
              size="small"
              variant={option.id === ALL_KEY ? 'filled' : 'outlined'}
              color={option.id === ALL_KEY ? 'primary' : 'default'}
              icon={option.id === ALL_KEY ? <DoneAllIcon /> : undefined}
              {...chipProps}
            />
          );
        });
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={hideInputLabel ? undefined : label}
          placeholder={
            !disabled && selectedOptions.length > 0
              ? ''
              : placeholder ?? 'Select titles...'
          }
          inputProps={{
            ...params.inputProps,
            'aria-label': hideInputLabel ? label : undefined,
          }}
          InputProps={{
            ...params.InputProps,
            startAdornment: showLeadingIcon ? (
              <>
                <InputAdornment position="start">
                  <FilterListIcon color="action" />
                </InputAdornment>
                {params.InputProps.startAdornment}
              </>
            ) : params.InputProps.startAdornment,
          }}
        />
      )}
    />
  );
};
