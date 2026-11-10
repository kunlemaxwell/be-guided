import { ReactNodeViewRenderer } from '@tiptap/react';
import type { AnyExtension } from '@tiptap/core';
import {
  coreExtensions,
  GuideCallout,
  GuideImage,
  GuideLegend,
  GuidePostings,
  GuideStep,
  GuideSteps,
  RawMarkdown,
} from '../../../../shared/editor/extensions';
import { CalloutView, LegendView, StepsView, StepView } from './node-views/ContainerViews';
import { ImageView } from './node-views/ImageView';
import { PostingsView } from './node-views/PostingsView';
import { RawView } from './node-views/RawView';

const VIEWS: Record<string, AnyExtension> = {
  [GuideSteps.name]: GuideSteps.extend({ addNodeView: () => ReactNodeViewRenderer(StepsView) }),
  [GuideStep.name]: GuideStep.extend({ addNodeView: () => ReactNodeViewRenderer(StepView) }),
  [GuideLegend.name]: GuideLegend.extend({ addNodeView: () => ReactNodeViewRenderer(LegendView) }),
  [GuideCallout.name]: GuideCallout.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) }),
  [GuidePostings.name]: GuidePostings.extend({ addNodeView: () => ReactNodeViewRenderer(PostingsView) }),
  [RawMarkdown.name]: RawMarkdown.extend({ addNodeView: () => ReactNodeViewRenderer(RawView) }),
};

/** The shared editor schema plus the on-screen controls for guide blocks. */
export function editorExtensions(resolveImageSrc: (src: string) => string): AnyExtension[] {
  return coreExtensions({ resolveImageSrc }).map((ext) => {
    if (ext.name === GuideImage.name) {
      return GuideImage.extend({ addNodeView: () => ReactNodeViewRenderer(ImageView) }).configure({ resolveSrc: resolveImageSrc });
    }
    return VIEWS[ext.name] ?? ext;
  });
}
