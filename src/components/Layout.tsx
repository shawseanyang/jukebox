import { Outlet } from 'react-router-dom';
import { Layout as Wrapper, Row, Col, Space } from 'antd';

const Layout = () => {
  return (
      <Wrapper
        style={{
          backgroundColor: '#E7F0F5',
        }}
      >
          <Row justify="center" align="top" style={{minHeight: '100vh'}}>
            <Col span={6} />
            <Col span={12}>
              <Space direction="vertical" size="large" style={{width: "100%"}}>
                <Col style={{minHeight: "15vh"}}></Col>
                <Outlet />
                <Col />
              </Space>
            </Col>
            <Col span={6} />
          </Row>
      </Wrapper>
  )
};

export default Layout