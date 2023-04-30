import { Skeleton, Image } from "antd";
import styled from "styled-components";

export type AlbumCoverProps = {
  imageUrl: string | null;
};

const SIZING = {
  width: "300px",
  height: "300px"
}

const AlbumCoverContainer = styled.div`
  width: 100%;
  height: 100%;
  `

const AlbumCover = (props: AlbumCoverProps) => {
  return (
    <AlbumCoverContainer>
      {props.imageUrl
      ? <Image src={props.imageUrl} style={SIZING} alt="album cover"/>
      : <Skeleton.Image style={SIZING} />}
    </AlbumCoverContainer>
  )
}

export default AlbumCover;