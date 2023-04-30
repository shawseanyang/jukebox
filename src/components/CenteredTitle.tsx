// a react function component that wraps its children in <Row justify="center"><Title>Up next</Title></Row>

import { Row, Typography } from "antd";

const { Title } = Typography;

const CenteredTitle = (props: { children: React.ReactNode }) => {
  return (
    <Row justify="center">
      <Title>{props.children}</Title>
    </Row>
  )
}

export default CenteredTitle;