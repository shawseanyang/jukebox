import { Avatar, List, Row, Skeleton } from "antd";
import { Artist, Song } from "../types/Music";
import Title from "antd/es/typography/Title";
import CenteredTitle from "./CenteredTitle";
import SongListItem from "./SongListItem";

export type QueueViewerProps = {
  queue: Song[];
  deleteSong: (index: number) => void;
};

const QueueViewer = (props: QueueViewerProps) => {

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
          actions={[
            <a key="delete" onClick={() => props.deleteSong(index)}>Delete</a>
          ]}>
          <SongListItem song={song} />
        </List.Item>
      )}
    />

  // if the queue is empty, render a skeleton. Otherwise, render the queue
  return (
    <>
      <CenteredTitle>Up next</CenteredTitle>
      {isQueueEmpty() ? SkeletonQueue : Queue}
    </>
  )
}

export default QueueViewer;