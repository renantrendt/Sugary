"use client";

import React from "react";

function UntitledPage() {
  return (
    <div className="flex w-full flex-col items-start bg-default-background h-screen">
      <div className="flex w-full flex-col items-center justify-center gap-4 bg-brand-50 px-6 pt-8 pb-6">
        <div className="flex w-full items-center justify-center gap-4 pb-2 overflow-x-auto">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 flex-none flex-col items-center justify-center gap-2 rounded-full bg-brand-300 mobile:bg-brand-300">
              <span className="text-heading-2 font-heading-2 text-brand-50">
                5
              </span>
            </div>
            <span className="text-caption font-caption text-default-font">
              Katie
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 flex-none flex-col items-center justify-center gap-2 rounded-full bg-brand-300 mobile:bg-brand-300">
              <span className="text-heading-2 font-heading-2 text-brand-50">
                12
              </span>
            </div>
            <span className="text-caption font-caption text-default-font">
              Bernardo
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 flex-none flex-col items-center justify-center gap-2 rounded-full bg-brand-300 mobile:bg-brand-300">
              <span className="text-heading-2 font-heading-2 text-brand-50">
                30
              </span>
            </div>
            <span className="text-caption font-caption text-default-font">
              Renan
            </span>
          </div>
        </div>
      </div>
      <div className="flex w-full grow shrink-0 basis-0 flex-col items-center justify-center gap-6 bg-brand-50 px-6 py-12 mobile:px-0 mobile:py-0">
        <div className="flex h-64 w-64 flex-none flex-col items-center justify-center gap-4 rounded-full bg-brand-300 mobile:shadow-md">
          <span className="text-heading-1 font-heading-1 text-brand-50 text-center">
            1
          </span>
        </div>
      </div>
    </div>
  );
}

export default UntitledPage;
