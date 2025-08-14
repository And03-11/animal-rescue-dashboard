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
} from '@mui/material';
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
}

export const FormTitleSelector: React.FC<FormTitleSelectorProps> = ({
  titles,
  onSelectionChange,
  isLoading = false,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<ApiListItem[]>([allOption]);

  useEffect(() => {
    if (!isLoading) {
      setSelectedOptions([allOption]);
    }
  }, [titles, isLoading]);

  useEffect(() => {
    if (selectedOptions.some(opt => opt.id === ALL_KEY)) {
      onSelectionChange(titles.map(t => t.id));
    } else {
      onSelectionChange(selectedOptions.map(opt => opt.id));
    }
  }, [selectedOptions, titles, onSelectionChange]);

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
    return <Skeleton variant="rectangular" animation="wave" height={56} />;
  }

  return (
    <Autocomplete
      multiple
      options={allTitlesWithOptions}
      value={selectedOptions}
      onChange={handleChange}
      disableCloseOnSelect
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
      renderTags={(value, getTagProps) =>
        value.map((option, index) => {
          const { key: chipKey, ...chipProps } = getTagProps({ index }); // why: 'key' es prop especial; se desestructura
          return (
            <Chip
              key={chipKey}
              label={option.name}
              variant={option.id === ALL_KEY ? 'filled' : 'outlined'}
              color={option.id === ALL_KEY ? 'primary' : 'default'}
              icon={option.id === ALL_KEY ? <DoneAllIcon /> : undefined}
              {...chipProps}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label="3. Filter by Form Title(s)"
          placeholder={
            selectedOptions.length > 0 && selectedOptions[0].id !== ALL_KEY
              ? 'Add more titles...'
              : 'Select titles...'
          }
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <InputAdornment position="start">
                  <FilterListIcon color="action" />
                </InputAdornment>
                {params.InputProps.startAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};
