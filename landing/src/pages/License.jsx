import Footer from '../components/Footer'

export default function License() {
  return (
    <div className="bg-surface text-primary">
      <main className="pt-16">
        {/* Header strip */}
        <section className="px-8 py-24 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="max-w-4xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Legal
            </p>
            <h1 className="text-[3.5rem] md:text-[4.5rem] font-black tracking-[-0.03em] leading-none mb-6">
              MIT LICENSE
            </h1>
            <p className="text-on-surface-variant text-[0.875rem] uppercase tracking-widest font-bold">
              Copyright © 2026 THD-Spatial
            </p>
          </div>
        </section>

        {/* License body */}
        <section className="px-8 py-24 bg-surface">
          <div className="max-w-4xl mx-auto">
            {/* Preamble card */}
            <div className="bg-surface-container-lowest p-12 mb-12 border-l-4 border-black">
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                Permission is hereby granted, free of charge, to any person obtaining a copy
                of this software and associated documentation files (the "Software"), to deal
                in the Software without restriction, including without limitation the rights
                to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
                copies of the Software, and to permit persons to whom the Software is
                furnished to do so, subject to the following conditions:
              </p>
            </div>

            <div className="bg-black text-[#E2E2E2] p-12 mb-12">
              <p className="font-bold text-[0.6875rem] uppercase tracking-widest mb-4 text-[#C6C6C6]">
                Condition
              </p>
              <p className="text-[0.875rem] leading-[1.8]">
                The above copyright notice and this permission notice shall be included in all
                copies or substantial portions of the Software.
              </p>
            </div>

            <div className="bg-surface-container-lowest p-12 border border-outline-variant/20">
              <p className="font-bold text-[0.6875rem] uppercase tracking-widest mb-6 text-outline">
                Disclaimer of Warranty
              </p>
              <p className="font-mono text-[0.8125rem] leading-[1.8] text-on-surface-variant">
                THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
                IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
                FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
                AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
                LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
                OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
                SOFTWARE.
              </p>
            </div>

            {/* Attribution */}
            <div className="mt-16 pt-8 border-t border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-1">
                  Project
                </p>
                <p className="font-black text-lg uppercase tracking-tight">
                  TEMPO — Tool for Energy Model Planning and Optimization
                </p>
              </div>
              <a
                href="https://opensource.org/licenses/MIT"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-black px-6 py-3 font-bold uppercase text-[0.6875rem] tracking-widest hover:bg-black hover:text-white transition-colors whitespace-nowrap"
              >
                OSI Approved ↗
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
