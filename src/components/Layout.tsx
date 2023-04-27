import { Outlet } from 'react-router-dom';
import { Layout as Wrapper, Row, Col } from 'antd';

const Layout = () => {
  return (
      <Wrapper
        style={{
          backgroundColor: '#E7F0F5',
        }}
      >
          <Row justify="center" align="middle" style={{minHeight: '100vh'}}>
            <Col span={6} />
            <Col span={12}>
              <Outlet />
            </Col>
            <Col span={6} />
          </Row>
      </Wrapper>
  )
};

export default Layout