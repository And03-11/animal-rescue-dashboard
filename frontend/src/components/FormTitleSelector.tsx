// frontend/src/components/FormTitleSelector.tsx (Versión Final Corregida)
import React, { useState, useEffect } from 'react';
import {
    TextField,
    Autocomplete,
    Checkbox,
    Chip,
    Divider,
    InputAdornment
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
}

export const FormTitleSelector: React.FC<FormTitleSelectorProps> = ({ titles, onSelectionChange }) => {
    const [selectedOptions, setSelectedOptions] = useState<ApiListItem[]>([allOption]);

    useEffect(() => {
        setSelectedOptions([allOption]);
    }, [titles]);

    useEffect(() => {
        if (selectedOptions.some(opt => opt.id === ALL_KEY)) {
            onSelectionChange(titles.map(t => t.id));
        } else {
            onSelectionChange(selectedOptions.map(opt => opt.id));
        }
    }, [selectedOptions, titles, onSelectionChange]);

    const handleChange = (_event: React.SyntheticEvent, newValue: ApiListItem[]) => {
        if (newValue.length === 0) {
            setSelectedOptions([allOption]);
            return;
        }
        const isSelectingAll = newValue.some(option => option.id === ALL_KEY);
        const wasAllSelected = selectedOptions.some(option => option.id === ALL_KEY);

        if (isSelectingAll && !wasAllSelected) {
            setSelectedOptions([allOption]);
        } else if (isSelectingAll && wasAllSelected) {
            setSelectedOptions(newValue.filter(option => option.id !== ALL_KEY));
        } else if (!isSelectingAll && wasAllSelected) {
            setSelectedOptions(newValue.filter(option => option.id !== ALL_KEY));
        } else {
            setSelectedOptions(newValue);
        }
    };
    
    const allTitlesWithOptions = [allOption, ...titles];

    return (
        <Autocomplete
            multiple
            options={allTitlesWithOptions}
            value={selectedOptions}
            onChange={handleChange}
            disableCloseOnSelect
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderOption={(props, option, { selected }) => (
                <React.Fragment key={option.id}>
                    <li {...props}>
                        <Checkbox
                            icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                            checkedIcon={<CheckBoxIcon fontSize="small" />}
                            style={{ marginRight: 8 }}
                            checked={selected}
                        />
                        {option.name}
                    </li>
                    {option.id === ALL_KEY && <Divider sx={{ my: 0.5 }} />}
                </React.Fragment>
            )}
            renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return (
                        <Chip
                            key={key}
                            label={option.name}
                            variant={option.id === ALL_KEY ? 'filled' : 'outlined'}
                            color={option.id === ALL_KEY ? 'primary' : 'default'}
                            icon={option.id === ALL_KEY ? <DoneAllIcon /> : undefined}
                            {...tagProps}
                        />
                    );
                })
            }
            renderInput={(params) => (
                <TextField 
                    {...params} 
                    label="3. Filter by Form Title(s)" 
                    placeholder={selectedOptions.length > 0 && selectedOptions[0].id !== ALL_KEY ? "Add more titles..." : "Select titles..."}
                    InputProps={{
                        ...params.InputProps,
                        // ✅ CORRECCIÓN: Envolvemos los adornos en un Fragment <> para combinarlos
                        // en lugar de reemplazarlos.
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