import { Avatar, Button, List, Row, Skeleton, Spin } from "antd";
import { Artist, Song } from "../types/Music";
import Title from "antd/es/typography/Title";
import CenteredTitle from "./CenteredTitle";
import SongListItem from "./SongListItem";
import { deleteSong } from "../types/Playback";
import LoadableButton from "./LoadableButton";
import { useState } from "react";

export type QueueViewerProps = {
  queue: Song[];
  deleteSong: deleteSong;
};

const QueueViewer = (props: QueueViewerProps) => {

  const [isLoading, setLoading] = useState<boolean>(false);

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
            <Button
              onClick={
                () => {
                  setLoading(true);
                  props.deleteSong(index, () => setLoading(false));
                }
              }
              type={"link"}
            >
              Delete
            </Button>
          ]}>
          <SongListItem song={song} />
        </List.Item>
      )}
    />

  // if the queue is empty, render a skeleton. Otherwise, render the queue
  return (
    <>
      <CenteredTitle>Up next</CenteredTitle>
      <Spin spinning={isLoading}>
        {isQueueEmpty() ? SkeletonQueue : Queue}
      </Spin>
    </>
  )
}

export default QueueViewer;