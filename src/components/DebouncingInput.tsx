import { Input } from 'antd';
import React from 'react';
import { debounce } from '../util/uiUtils';

export type DebouncingInputProps = {
  addonBefore: React.ReactNode;
  placeholder: string;
  onChange: (value: string) => void;
  onDebouncedChange: (value: string) => void;
}

const DebouncingInput = (props: DebouncingInputProps) => {
  const debouncedSearch = debounce(props.onDebouncedChange, 1000);
  return (
    <Input
      addonBefore={props.addonBefore}
      placeholder={props.placeholder}
      allowClear
      onChange={(e) => {
        props.onChange(e.currentTarget.value);
        debouncedSearch(e.currentTarget.value);
      }}
    />
  );
};

export default DebouncingInput;