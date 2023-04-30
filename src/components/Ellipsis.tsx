// Ellipsizes the given text if its too long

import { useState } from "react";
import { Typography } from "antd";

module Ellipsis {
  export const Text = ({ text }: { text: string }) => {
    const [ellipsis, setEllipsis] = useState(true);
    return (
      <Typography.Text
        ellipsis={ellipsis}
        onClick={() => setEllipsis(!ellipsis)}
      >
        {text}
      </Typography.Text>
    )
  }
  export const Paragraph = ({ text }: { text: string }) => {
    const [ellipsis, setEllipsis] = useState(true);
    return (
      <Typography.Paragraph
        ellipsis={ellipsis}
        onClick={() => setEllipsis(!ellipsis)}
      >
        {text}
      </Typography.Paragraph>
    )
  }

  type levels = 1 | 2 | 3 | 4 | 5 | undefined;

  export const Title = ({ text, level }: { text: string, level?: levels }) => {
    const [ellipsis, setEllipsis] = useState(true);
    return (
      <Typography.Title
        ellipsis={ellipsis}
        onClick={() => setEllipsis(!ellipsis)}
        level={level}
      >
        {text}
      </Typography.Title>
    )
  }
}

export default Ellipsis;