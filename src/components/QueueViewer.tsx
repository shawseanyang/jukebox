import { Avatar, List, Row, Skeleton } from "antd";
import { Artist, Song } from "../types/Music";
import Title from "antd/es/typography/Title";

export type QueueViewerProps = {
  queue: Song[];
  deleteSong: (index: number) => void;
};

const QueueViewer = (props: QueueViewerProps) => {

  function formatArtistsNames(artists: Artist[]) {
    return artists.map((artist) => artist.name).join(", ");
  }

  function isQueueEmpty() {
    return props.queue.length === 0;
  }

  const SkeletonQueue =
    <List
      itemLayout="horizontal"
      dataSource={[1, 2, 3]}
      renderItem={() => (
        <List.Item>
          <Skeleton.Button block />
        </List.Item>
      )}
    />

  const Queue =
    <List
      itemLayout="horizontal"
      dataSource={props.queue}
      renderItem={(song, index) => (
        <List.Item
          actions={[<a key="delete" onClick={() => props.deleteSong(index)}>Delete</a>]}
        >
          <List.Item.Meta
            avatar={<Avatar shape="square" size="large" src={song.album.imageUrl} />}
            title={song.name}
            description={formatArtistsNames(song.artists)}
          />
        </List.Item>
      )}
    />

  // if the queue is empty, render a skeleton. Otherwise, render the queue
  return (
    <>
      <Row justify="center">
        <Title>Up next</Title>
      </Row>
      {isQueueEmpty() ? SkeletonQueue : Queue}
    </>
  )
}

export default QueueViewer;