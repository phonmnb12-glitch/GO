import CreatePhotoAIMission from "@/components/create-photo-ai-mission"

export const metadata = {
  title: "Create Timelapse Video Mission | go.",
  description: "Set up your Timelapse Video mission with real browser recording",
}

export default function CreateTimelapseVideoMissionPage() {
  return <CreatePhotoAIMission verificationType="Timelapse Video" />
}
