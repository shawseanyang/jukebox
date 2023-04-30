// A button that is placed into a loading state when clicked and returns to its original state when the callback is called. Its props take in the callback, the arguments for it, and props for the underlying button.

import { Button } from "antd";
import { useState } from "react";

export interface loadableButtonProps {
  children?: React.ReactNode;
  args: any[];
  callback: (...args: any[]) => void;
  buttonProps: any;
}

const LoadableButton = (props: loadableButtonProps) => {
  const [isLoading, setLoading] = useState<boolean>(false);
  function onClick () {
    setLoading(true);
    props.callback(...props.args, () => setLoading(false));
  }
  return (
    <Button
      key="0"
      loading={isLoading}
      onClick={onClick}
      {...props.buttonProps}
    >
      {props.children}
    </Button>
  )
}

export default LoadableButton