import { Input } from 'antd';
import React from 'react';

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

function debounce<F extends (...args: any[]) => any>(func: F, delay: number) {
  let timerId: NodeJS.Timeout;
  return function (this: ThisParameterType<F>, ...args: Parameters<F>) {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

export default DebouncingInput;